import { APP_NAME, INSTRUMENT_NOTE_LAYOUT_KINDS } from "$config"
import { ComposedSong } from "$lib/Songs/ComposedSong"
import { RecordedSong } from "$lib/Songs/RecordedSong"
import { Column, ColumnNote, InstrumentData, RecordedNote } from "$lib/Songs/SongClasses"
import Instrument from "../Instrument"
import { NoteLayer } from "../Layer"


type NoteDifference = {
    delay: number
    index: number
    layer: NoteLayer
    time: number
}
export class VisualSong {
    private baseChunks: _Chunk[] = []
    type: 'song' | 'composed' = 'song'
    chunks: _Chunk[] = []
    text: string = ''
    instruments: Instrument[] = []
    constructor(){
        this.instruments = [new Instrument()]
    }
    get currentChunk() {
        return this.baseChunks[this.baseChunks.length - 1]
    }

    static noteDifferences(notes: RecordedNote[]) {
        const parsed: NoteDifference[] = []
        for (let i = 0; i < notes.length; i++) {
            const delay = notes[i + 1] ? notes[i + 1].time - notes[i].time : 0
            parsed.push({
                delay,
                index: notes[i].index,
                time: notes[i].time,
                layer: notes[i].layer
            })
        }
        return parsed
    }
    static from(song: RecordedSong | ComposedSong) {
        const vs = new VisualSong()
        if(song instanceof RecordedSong){
            vs.createChunk(0)
        }else if(song instanceof ComposedSong){
            const { columns } = song
            const padding = [...columns].reverse().findIndex(column => column.notes.length)
            const trimmed = columns.slice(0, columns.length - padding).map(column => column.clone())
            
            for(let i = 0; i < trimmed.length; i++){
                const column = trimmed[i]
                if(column.tempoChanger === vs.currentChunk?.tempoChanger){
                    vs.currentChunk.addColumn(ChunkColumn.from(column))
                }else{
                    vs.currentChunk.addColumn(ChunkColumn.from(column))
                    vs.createChunk(column.tempoChanger as ChunkTempoChanger)
                }
            }
        }
        vs.finalize()
        return vs
    }
    finalize() {
        console.log(this.baseChunks)
        this.text = this.baseChunks.map(chunk => chunk.toString()).join(' ')
    }
    createChunk(changer?: ChunkTempoChanger){
        //TODO need to remove instrument here
        const chunk = new _Chunk(this.instruments[0], changer || 1)
        this.baseChunks.push(chunk)
        return chunk
    }
    addChunk(chunk: _Chunk) {
        this.baseChunks.push(chunk)
    }

}

class ChunkNote{
    index: number
    layer: number
    constructor(index?: number, layer?: number){
        this.index = index || 0
        this.layer = layer || 0
    }
    static from(columnNote: ColumnNote){
        const layer = 1 + columnNote.layer.toArray().findIndex(l => l === 1)
        const chunkNote = new ChunkNote(columnNote.index, layer)
        return chunkNote
    }
}

type ChunkTempoChanger = 0 | 1 | 2 | 3
class ChunkColumn{
    notes: ChunkNote[] = []

    addNote(note: ChunkNote){
        this.notes.push(note)
    }
    static from(column: Column){
        const chunkColumn = new ChunkColumn()
        column.notes.forEach(note => {
            chunkColumn.addNote(ChunkNote.from(note))
        })   
        return chunkColumn
    }
}

const tempoChangerMap = {
    0: '',
    1: '*',
    2: '~',
    3: '^',
}
export class _Chunk{
    columns: ChunkColumn[] = []
    tempoChanger: ChunkTempoChanger
    instrument: Instrument
    constructor(instrument: Instrument, changer?:ChunkTempoChanger){
        this.tempoChanger = changer || 0
        this.instrument = instrument
    }
    get tempoString(){
        return tempoChangerMap[this.tempoChanger]
    }
    addColumn(column: ChunkColumn){
        this.columns.push(column)
    }
    toString(){
        const notes = this.columns.map(column => column.notes).flat()
        const text = notes.map(note => 
            this.instrument.getNoteText(note.index, APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC', 'C')
        ).join('')
        return notes.length ? text : `[${this.tempoString}${text}]`
    }
}

export class Chunk {
    notes: RecordedNote[] = []
    delay = 0
    constructor(notes: RecordedNote[] = [], delay: number = 0) {
        this.notes = notes
        this.delay = delay
    }
}