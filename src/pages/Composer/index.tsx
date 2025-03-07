import { Component } from 'react'
import { FaPlay, FaPlus, FaPause, FaBars, FaChevronLeft, FaChevronRight, FaTools } from 'react-icons/fa';

import { APP_NAME, MIDI_STATUS, LAYERS_INDEXES, TEMPO_CHANGERS, Pitch, TempoChanger } from "appConfig"

import AddColumn from 'components/icons/AddColumn';
import RemoveColumn from "components/icons/RemoveColumn"

import MidiParser from "components/Composer/MidiParser"
import ComposerTools from "components/Composer/ComposerTools"
import ComposerKeyboard from "components/Composer/ComposerKeyboard"
import ComposerCanvas from "components/Composer/Canvas"
import Menu from "components/Composer/Menu"
import Memoized from 'components/Memoized';
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts"
import { ComposerSettingsDataType } from "lib/BaseSettings"
import Instrument, { NoteData } from "lib/Instrument"
import { delay, formatMs, calculateSongLength, parseSong } from "lib/Tools"
import { ComposedSong, SerializedComposedSong } from 'lib/Songs/ComposedSong';
import { Column } from 'lib/Songs/SongClasses';
import AudioRecorder from 'lib/AudioRecorder'

import Analytics from 'lib/Analytics';
import { withRouter } from 'react-router-dom'
import HomeStore from 'stores/HomeStore';
import LoggerStore from 'stores/LoggerStore';
import { SerializedRecordedSong, RecordedSong } from 'lib/Songs/RecordedSong';
import { SongInstruments } from 'types/SongTypes';
import { SettingUpdate, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { ComposerInstruments, InstrumentName, LayerIndex, LayerType, NoteNameType, Pages } from 'types/GeneralTypes';
import "./Composer.css"
import { MIDIEvent, MIDIProvider } from 'lib/Providers/MIDIProvider';
import { KeyboardProvider } from 'lib/Providers/KeyboardProvider';
import type { KeyboardNumber } from 'lib/Providers/KeyboardProvider/KeyboardTypes';
import { AudioProvider } from 'lib/Providers/AudioProvider';
import { BodyDropper, DroppedFile } from 'components/BodyDropper';
import { CanvasTool } from 'components/Composer/CanvasTool';
import { settingsService } from 'lib/Services/SettingsService';
import { SerializedSong } from 'lib/Songs/Song';
import { songsStore } from 'stores/SongsStore';

interface ComposerState {
    layers: ComposerInstruments
    song: ComposedSong
    settings: ComposerSettingsDataType
    layer: LayerType
    selectedColumns: number[]
    copiedColumns: Column[]
    isToolsVisible: boolean
    isMidiVisible: boolean
    isRecordingAudio: boolean
    isPlaying: boolean
}
class Composer extends Component<any, ComposerState>{
    state: ComposerState
    broadcastChannel: BroadcastChannel | null
    mounted: boolean
    changes: number
    unblock: () => void
    constructor(props: any) {
        super(props)
        const settings = settingsService.getComposerSettings()
        this.state = {
            layers: [new Instrument(), new Instrument(), new Instrument(), new Instrument()],
            isPlaying: false,
            song: new ComposedSong("Untitled"),
            settings: settings,
            layer: 1,
            selectedColumns: [],
            copiedColumns: [],
            isToolsVisible: false,
            isMidiVisible: false,
            isRecordingAudio: false,
        }
        this.state.song.bpm = settings.bpm.value
        this.state.song.instruments = [
            settings.layer1.value,
            settings.layer2.value,
            settings.layer3.value,
            settings.layer4.value
        ]
        this.mounted = false
        this.changes = 0
        this.broadcastChannel = null
        this.unblock = () => { }
    }

    get currentInstrument() {
        return this.state.layers[this.state.layer - 1]
    }

    componentDidMount() {
        this.mounted = true
        this.init()

        this.broadcastChannel = window.BroadcastChannel ? new BroadcastChannel(APP_NAME + '_composer') : null
        if (this.broadcastChannel) {
            this.broadcastChannel.addEventListener('message', (event) => {
                if (!this.state.settings.syncTabs.value) return
                if (!['play', 'stop'].includes(event?.data)) return
                this.togglePlay(event.data === 'play')
            })
        }
        this.unblock = this.props.history.block((data: any) => {
            if (this.changes !== 0) {
                this.changePage(data.pathname)
                return false
            }
        })
        if (window.location.hostname !== "localhost") {
            window.addEventListener("beforeunload", this.handleUnload)
        }
    }

    componentWillUnmount() {
        const { state } = this
        const { layers } = state
        this.mounted = false
        AudioProvider.clear()
        layers.forEach(instrument => instrument.delete())
        this.broadcastChannel?.close?.()
        state.isPlaying = false
        this.unblock()
        KeyboardProvider.unregisterById('composer')
        MIDIProvider.removeListener(this.handleMidi)
        if (window.location.hostname !== "localhost") {
            window.removeEventListener("beforeunload", this.handleUnload)
        }
    }

    init = async () => {
        const { settings } = this.state
        //TODO if new layer is added    
        const promises = [
            this.loadInstrument(settings.layer1.value, 1),
            this.loadInstrument(settings.layer2.value, 2),
            this.loadInstrument(settings.layer3.value, 3),
            this.loadInstrument(settings.layer4.value, 4)
        ]
        if (this.mounted) await Promise.all(promises)
        if (this.mounted) await AudioProvider.init()
        AudioProvider.setReverb(settings.caveMode.value)
        MIDIProvider.addListener(this.handleMidi)
        this.registerKeyboardListeners()
    }
    registerKeyboardListeners = () => {
        const id = 'composer'
        KeyboardProvider.registerLetter('D', () => {
            if (!this.state.isPlaying) this.selectColumn(this.state.song.selected + 1)
        }, { id })
        KeyboardProvider.registerLetter('A', () => {
            if (!this.state.isPlaying) this.selectColumn(this.state.song.selected - 1)
        }, { id })
        KeyboardProvider.registerLetter('Q', () => {
            if (!this.state.isPlaying) this.removeColumns(1, this.state.song.selected)
        }, { id })
        KeyboardProvider.registerLetter('E', () => {
            if (!this.state.isPlaying) this.addColumns(1, this.state.song.selected)
        }, { id })
        TEMPO_CHANGERS.forEach((tempoChanger, i) => {
            KeyboardProvider.registerNumber(i + 1 as KeyboardNumber, () => this.handleTempoChanger(tempoChanger), { id })
        })
        KeyboardProvider.register('ArrowUp', () => {
            const nextLayer = this.state.layer - 1
            if (nextLayer > 0) this.changeLayer(nextLayer as LayerType)
        }, { id })
        KeyboardProvider.register('ArrowDown', () => {
            const nextLayer = this.state.layer + 1
            if (nextLayer < this.state.layers.length + 1) this.changeLayer(nextLayer as LayerType)
        }, { id })
        KeyboardProvider.register('Space', ({ event }) => {
            if (event.repeat) return
            this.togglePlay()
            if (this.state.settings.syncTabs.value) {
                this.broadcastChannel?.postMessage?.(this.state.isPlaying ? 'play' : 'stop')
            }
        }, { id })
        KeyboardProvider.listen(({ event, letter }) => {
            if (event.repeat) return
            const { isPlaying } = this.state
            const shouldEditKeyboard = isPlaying || event.shiftKey
            if (shouldEditKeyboard) {
                const note = this.currentInstrument.getNoteFromCode(letter)
                if (note !== null) this.handleClick(this.currentInstrument.layout[note])
            }
        }, { id })
    }
    componentDidCatch() {
        LoggerStore.error("There was an error with the Composer, reloading the page...")
        setTimeout(window.location.reload, 3000)
    }
    handleUnload = (event: BeforeUnloadEvent) => {
        event.preventDefault()
        event.returnValue = ''
    }
    handleAutoSave = () => {
        this.changes++
        if (this.changes > 5 && this.state.settings.autosave.value) {
            //TODO maybe add here that songs which arent saved dont get autosaved
            if (this.state.song.name !== "Untitled") {
                this.updateSong(this.state.song)
            }

        }
    }
    handleMidi = ([eventType, note, velocity]: MIDIEvent) => {
        if (!this.mounted) return
        const { song, layer } = this.state
        if (MIDI_STATUS.down === eventType && velocity !== 0) {
            const keyboardNotes = MIDIProvider.settings.notes.filter(e => e.midi === note)
            keyboardNotes.forEach(keyboardNote => {
                this.handleClick(this.currentInstrument.layout[keyboardNote.index])
            })
            const shortcut = MIDIProvider.settings.shortcuts.find(e => e.midi === note)
            if (!shortcut) return
            switch (shortcut.type) {
                case 'toggle_play': this.togglePlay(); break;
                case 'next_column': this.selectColumn(song.selected + 1); break;
                case 'previous_column': this.selectColumn(song.selected - 1); break;
                case 'add_column': this.addColumns(1, song.selected); break;
                case 'remove_column': this.removeColumns(1, song.selected); break;
                case 'change_layer': {
                    let nextLayer = layer + 1
                    if (nextLayer > LAYERS_INDEXES.length) nextLayer = 1
                    this.changeLayer(nextLayer as LayerType)
                    break;
                }
                default: break;
            }
        }
    }
    handleDrop = async (files: DroppedFile<SerializedSong>[]) => {
        for (const file of files) {
            const parsed = (Array.isArray(file.data) ? file.data : [file.data]) as SerializedSong[]
            try {
                for (const song of parsed) {
                    const parsedSong = parseSong(song)
                    await this.addSong(parsedSong)
                    LoggerStore.success(`Song added to the ${parsedSong?.isComposed ? "Composed" : "Recorded"} tab!`, 4000)
                }
                
            } catch (e) {
                console.error(e)
                LoggerStore.error("There was an error loading the song!")
            }
        }
    }

    handleDropError = () => {
        LoggerStore.error("There was an error importing the file! Was it the correct format?")
    }

    updateSettings = (override?: ComposerSettingsDataType) => {
        settingsService.updateComposerSettings(override !== undefined ? override : this.state.settings)
    }

    handleSettingChange = ({ data, key }: SettingUpdate) => {
        const { song, settings } = this.state
        //@ts-ignore
        settings[key] = { ...settings[key], value: data.value }
        if (data.songSetting) {
            //@ts-ignore
            song[key] = data.value
        }
        //TODO if new layer is added
        if (key === "layer1") this.loadInstrument(data.value as InstrumentName, 1)
        if (key === "layer2") this.loadInstrument(data.value as InstrumentName, 2)
        if (key === "layer3") this.loadInstrument(data.value as InstrumentName, 3)
        if (key === "layer4") this.loadInstrument(data.value as InstrumentName, 4)
        if (key === "caveMode") AudioProvider.setReverb(data.value as boolean)
        this.setState({ settings: { ...settings }, song }, this.updateSettings)
    }
    loadInstrument = async (name: InstrumentName, layer: LayerType) => {
        if (!this.mounted) return
        const { settings, layers } = this.state
        const instrument = new Instrument(name)
        AudioProvider.disconnect(layers[layer - 1].endNode)
        layers[layer - 1].delete()
        layers[layer - 1] = instrument
        await instrument.load()
        AudioProvider.connect(instrument.endNode)
        if (!this.mounted) return
        instrument.changeVolume(settings[`layer${layer}`]?.volume)
        this.setState({ layers })
    }
    changeVolume = (obj: SettingVolumeUpdate) => {
        const settings = this.state.settings
        const layer = Number(obj.key.split("layer")[1]) - 1
        //@ts-ignore
        settings[obj.key] = { ...settings[obj.key], volume: obj.value }
        this.state.layers[layer].changeVolume(obj.value)
        this.setState({ settings: { ...settings } }, this.updateSettings)
    }
    startRecordingAudio = async (override?: boolean) => {
        if (!this.mounted) return
        if (!override) {
            this.setState({ isRecordingAudio: false })
            return this.togglePlay(false)
        }
        AudioProvider.startRecording()
        this.setState({ isRecordingAudio: true })
        await this.togglePlay(true) //wait till song finishes
        if (!this.mounted) return
        this.setState({ isRecordingAudio: false })
        const recording = await AudioProvider.stopRecording()
        if (!recording) return
        const fileName = await asyncPrompt("Write the song name, press cancel to ignore")
        if (fileName) AudioRecorder.downloadBlob(recording.data, fileName + '.wav')
    }
    playSound = (instrument: Instrument, index: number) => {
        const note = instrument.layout[index]
        if (note === undefined) return
        instrument.play(note.index, this.state.settings.pitch.value as Pitch)
    }
    changePitch = (value: Pitch) => {
        const { settings } = this.state
        settings.pitch = { ...settings.pitch, value }
        this.setState({ settings: { ...settings } }, this.updateSettings)
    }
    handleClick = (note: NoteData) => {
        const { layers, song, layer } = this.state
        const column = song.selectedColumn
        const index = column.getNoteIndex(note.index)
        const layerIndex = layer - 1 as LayerIndex
        if (index === null) { //if it doesn't exist, create a new one
            const columnNote = column.addNote(note.index)
            columnNote.setLayer(layerIndex, true)
        } else { //if it exists, toggle the current layer and if it's 000 delete it
            const currentNote = column.notes[index]
            currentNote.toggleLayer(layerIndex)
            if (currentNote.layer.isEmpty()) column.removeAtIndex(index)
        }
        this.setState({ song })
        this.handleAutoSave()
        this.playSound(
            layers[layerIndex],
            note.index
        )
    }
    renameSong = async (newName: string, id: string ) => {
        const {song} = this.state
        await songsStore.renameSong(id, newName)
        if(this.state.song.id === id){
            song.name = newName
            this.setState({ song })
        }
    }
    addSong = async (song: ComposedSong | RecordedSong) => {
        const id = await songsStore.addSong(song)
        song.id = id
        return song
    }
    updateSong = async (song: ComposedSong): Promise<void> => {
        //if it is the default song, ask for name and add it
        if (song.name === "Untitled") {
            const name = await asyncPrompt("Write song name, press cancel to ignore")
            if (name === null || !this.mounted) return
            song.name = name
            this.changes = 0
            this.setState({})
            await this.addSong(song)
            return 
        }
        return new Promise(async resolve => {
            const { settings } = this.state
            //if it exists, update it
            if (await songsStore.existsSong(song)) {
                song.instruments[0] = settings.layer1.value
                song.instruments[1] = settings.layer2.value
                song.instruments[2] = settings.layer3.value
                song.instruments[3] = settings.layer4.value
                await songsStore.updateSong(song)
                console.log("song saved:", song.name)
                this.changes = 0
                this.setState({})
            } else {
                //if it doesn't exist, add it
                if (song.name.includes("- Composed")) {
                    const name = await asyncPrompt("Write song name, press cancel to ignore")
                    if (name === null) return resolve()
                    song.name = name
                    this.addSong(song)
                    return resolve()
                }
                console.log("song doesn't exist")
                song.name = "Untitled"
                this.updateSong(song)
            }
            resolve()
        })
    }
    updateThisSong = async () => {
        this.updateSong(this.state.song)
    }
    askForSongUpdate = async () => {
        return await asyncConfirm(`You have unsaved changes to the song: "${this.state.song.name}" do you want to save now?`, false)
    }
    createNewSong = async () => {
        if (this.state.song.name !== "Untitled" && this.changes > 0) {
            if (await this.askForSongUpdate()) {
                await this.updateSong(this.state.song)
            }
        }
        const name = await asyncPrompt("Write song name, press cancel to ignore")
        if (name === null) return
        const song = new ComposedSong(name)
        this.changes = 0
        if (!this.mounted) return
        const added = await this.addSong(song) as ComposedSong
        if (!this.mounted) return
        this.setState({ song: added})
        Analytics.songEvent({ type: 'create' })
    }
    loadSong = async (song: SerializedSong | ComposedSong) => {
        const state = this.state
        let parsed: ComposedSong | null = null
        if(song instanceof ComposedSong){
            //TODO not sure if i should clone the song here
            parsed = song
        }else{
            if(song.type === 'recorded'){
                parsed = RecordedSong.deserialize(song as SerializedRecordedSong).toComposedSong(4)
                parsed.name += " - Composed"
            }
            if(song.type === 'composed'){
                parsed = ComposedSong.deserialize(song as SerializedComposedSong)
            }
        }
        if(!parsed) return
        if (this.changes !== 0) {
            let confirm = state.settings.autosave.value && state.song.name !== "Untitled"
            if (!confirm && state.song.columns.length > 0) {
                confirm = await asyncConfirm(`You have unsaved changes to the song: "${state.song.name}" do you want to save? UNSAVED CHANGES WILL BE LOST`, false)
            }
            if (confirm) {
                await this.updateSong(state.song)
                //TODO once i change to ID i need to remove this
                if (state.song.name === parsed.name) return
            }
        }
        const settings = this.state.settings
        settings.bpm = { ...settings.bpm, value: song.bpm }
        settings.pitch = { ...settings.pitch, value: song.pitch }
        if (!this.mounted) return
        const layers = parsed.instruments
        layers.forEach((layer, i) => {
            //@ts-ignore
            if (settings[`layer${i + 1}`].value !== layer) {
                //@ts-ignore
                this.loadInstrument(parsed.instruments[i], i + 1)
                //@ts-ignore
                settings[`layer${i + 1}`] = { ...settings[`layer${i + 1}`], value: layer }
            }
        })
        this.changes = 0
        console.log("song loaded")
        this.setState({
            song: parsed,
            settings: { ...settings },
            selectedColumns: []
        })
    }

    addColumns = (amount = 1, position: number | 'end' = "end"): Promise<void> => {
        return new Promise(resolve => {
            const { song } = this.state
            song.addColumns(amount, position)
            if (amount === 1) this.selectColumn(song.selected + 1)
            this.handleAutoSave()
            this.setState({ song }, resolve)
        })
    }

    removeColumns = (amount: number, position: number) => {
        const { song } = this.state
        if (song.columns.length < 16) return
        song.removeColumns(amount, position)
        if (song.columns.length <= song.selected) this.selectColumn(song.selected - 1)
        this.handleAutoSave()
        this.setState({ song })
    }

    togglePlay = async (override?: boolean): Promise<void> => {
        return new Promise(resolve => {
            const newState = typeof override === "boolean" ? override : !this.state.isPlaying
            this.setState({
                isPlaying: newState
            }, async () => {
                if (this.state.isPlaying) this.selectColumn(this.state.song.selected)
                let pastError = 0
                let previousTime = new Date().getTime()
                while (this.state.isPlaying) {
                    const { song, settings } = this.state
                    const tempoChanger = song.selectedColumn.getTempoChanger().changer
                    const msPerBPM = Math.floor(60000 / settings.bpm.value * tempoChanger) + pastError
                    previousTime = new Date().getTime()
                    await delay(msPerBPM)
                    if (!this.state.isPlaying || !this.mounted) break
                    this.handleTick()
                    pastError = previousTime + msPerBPM - new Date().getTime()
                }
                resolve()
            })
        })
    }


    handleTick = () => {
        const newIndex = this.state.song.selected + 1
        if (this.state.isPlaying && newIndex > this.state.song.columns.length - 1) {
            return this.togglePlay(false)
        }
        this.selectColumn(newIndex)
    }

    toggleBreakpoint = (override?: number) => {
        const { song } = this.state
        song.toggleBreakpoint(override)
        this.validateBreakpoints()
        this.setState({ song })
    }
    handleTempoChanger = (changer: TempoChanger) => {
        const { song } = this.state
        song.selectedColumn.setTempoChanger(changer)
        this.handleAutoSave()
        this.setState({ song })
    }
    changePage = async (page: Pages | 'Home') => {
        const { song, settings } = this.state
        if (page === 'Home') return HomeStore.open()
        if (this.changes !== 0) {
            if (settings.autosave.value) {
                await this.updateSong(song)
            } else {
                const confirm = await asyncConfirm(`You have unsaved changes to the song: "${song.name}" do you want to save? UNSAVED CHANGES WILL BE LOST`, false)
                if (confirm) {
                    await this.updateSong(song)
                }
            }
        }
        this.unblock()
        this.props.history.push(page)
    }
    selectColumn = (index: number, ignoreAudio?: boolean) => {
        const { song, isToolsVisible, layers, copiedColumns } = this.state
        let selectedColumns = this.state.selectedColumns
        if (index < 0 || index > song.columns.length - 1) return
        song.selected = index
        if (isToolsVisible && copiedColumns.length === 0) {
            selectedColumns.push(index)
            const min = Math.min(...selectedColumns)
            const max = Math.max(...selectedColumns)
            selectedColumns = new Array(max - min + 1).fill(0).map((e, i) => min + i)
        }
        this.setState({ song, selectedColumns })
        if (ignoreAudio) return
        song.selectedColumn.notes.forEach(note => {
            layers.forEach((layer, i) => {
                if (note.isLayerToggled(i as LayerIndex)) this.playSound(layer, note.index)
            })
        })
    }
    changeLayer = (layer: LayerType) => {
        this.setState({ layer })
    }
    toggleTools = () => {
        this.setState({
            isToolsVisible: !this.state.isToolsVisible,
            selectedColumns: this.state.isToolsVisible ? [] : [this.state.song.selected],
            copiedColumns: []
        })
    }
    resetSelection = () => {
        this.setState({ copiedColumns: [], selectedColumns: [this.state.song.selected] })
    }
    copyColumns = (layer: LayerType | 'all') => {
        const { selectedColumns, song } = this.state
        const copiedColumns = song.copyColumns(selectedColumns, layer)
        this.changes++
        this.setState({ selectedColumns: [], copiedColumns })
    }
    pasteColumns = async (insert: boolean) => {
        const { song, copiedColumns } = this.state
        song.pasteColumns(copiedColumns, insert)
        this.changes++
        this.setState({ song })
    }
    eraseColumns = (layer: LayerType | 'all') => {
        const { song, selectedColumns } = this.state
        song.eraseColumns(selectedColumns, layer)
        this.changes++
        this.setState({ song, selectedColumns: [song.selected] })
    }
    validateBreakpoints = () => {
        const { song } = this.state
        song.validateBreakpoints()
        this.setState({ song })
    }
    deleteColumns = async () => {
        const { song, selectedColumns } = this.state
        song.deleteColumns(selectedColumns)
        this.changes++
        this.setState({
            song,
            selectedColumns: [song.selected]
        }, this.validateBreakpoints)
    }
    changeMidiVisibility = (visible: boolean) => {
        this.setState({ isMidiVisible: visible })
        if (visible) Analytics.songEvent({ type: 'create_MIDI' })
    }
    render() {
        const { state } = this
        const { isMidiVisible, song, isPlaying, copiedColumns, settings, isRecordingAudio, isToolsVisible, layer, selectedColumns, layers } = state
        const {
            loadSong, createNewSong, changePage, updateThisSong, handleSettingChange, changeVolume, startRecordingAudio, handleClick,
            toggleBreakpoint, handleTempoChanger, changeLayer, copyColumns, pasteColumns, eraseColumns, resetSelection, deleteColumns, changeMidiVisibility,
            selectColumn, toggleTools, changePitch, handleDrop, handleDropError, renameSong
        } = this

        const songLength = calculateSongLength(song.columns, settings.bpm.value, song.selected)
        return <>
            {isMidiVisible &&
                <MidiParser
                    functions={{ loadSong, changeMidiVisibility, changePitch }}
                    data={{
                        instruments: layers.map(layer => layer.name) as SongInstruments,
                        selectedColumn: song.selected,
                    }}
                />
            }
            <BodyDropper
                onDrop={handleDrop}
                as='json'
                dropAreaStyle={{ paddingTop: '15vh' }}
                showDropArea={true}
                onError={handleDropError}
            />

            <div className="right-panel-composer">
                <div className="column fill-x">
                    <div className="top-panel-composer">
                        <div className="buttons-composer-wrapper">
                            <CanvasTool onClick={() => this.selectColumn(song.selected + 1)}>
                                <Memoized>
                                    <FaChevronRight size={16}/>
                                </Memoized>
                            </CanvasTool>
                            <CanvasTool  onClick={() => this.selectColumn(song.selected - 1)}>
                                <Memoized>
                                    <FaChevronLeft size={16}/>
                                </Memoized>
                            </CanvasTool>

                            <CanvasTool onClick={() => {
                                this.togglePlay()
                                if (settings.syncTabs.value) {
                                    this.broadcastChannel?.postMessage?.(isPlaying ? 'stop' : 'play')
                                }
                            }}>
                                <Memoized>
                                    {this.state.isPlaying
                                        ? <FaPause key='pause' size={16}/>
                                        : <FaPlay key='play' size={16}/>
                                    }
                                </Memoized>
                            </CanvasTool>
                        </div>
                        <ComposerCanvas
                            key={settings.columnsPerCanvas.value}
                            functions={{ selectColumn, toggleBreakpoint }}
                            data={{
                                settings, selectedColumns,
                                columns: song.columns,
                                selected: song.selected,
                                breakpoints: song.breakpoints,
                            }}
                        />
                        <div className="buttons-composer-wrapper-right">
                            <CanvasTool onClick={() => this.addColumns(1, song.selected)} tooltip='Add column'>
                                <Memoized>
                                    <AddColumn className="tool-icon" />
                                </Memoized>
                            </CanvasTool>
                            <CanvasTool onClick={() => this.removeColumns(1, song.selected)} tooltip='Remove column'>
                                <Memoized>
                                    <RemoveColumn className='tool-icon' />
                                </Memoized>
                            </CanvasTool>
                            <CanvasTool 
                                onClick={() => this.addColumns(Number(settings.beatMarks.value) * 4, "end")}
                                tooltip='Add new page'
                            >
                                <Memoized>
                                    <FaPlus size={16}/>
                                </Memoized>
                            </CanvasTool>
                            <CanvasTool onClick={this.toggleTools} tooltip='Open tools'>
                                <Memoized>
                                    <FaTools size={16}/>
                                </Memoized>
                            </CanvasTool>
                        </div>
                    </div>
                </div>
                <ComposerKeyboard
                    functions={{ handleClick, handleTempoChanger, changeLayer }}
                    data={{
                        isPlaying, layer,
                        keyboard: layers[0],
                        currentColumn: song.selectedColumn,
                        pitch: settings.pitch.value as Pitch,
                        noteNameType: settings.noteNameType.value as NoteNameType,
                    }}
                />
            </div>
            <Menu
                data={{
                    isRecordingAudio, settings,
                    hasChanges: this.changes > 0,
                }}
                functions={{
                    loadSong, createNewSong, changePage, updateThisSong, handleSettingChange,
                     changeVolume, changeMidiVisibility, startRecordingAudio, renameSong
                }}
            />
            <ComposerTools
                data={{
                    isToolsVisible, layer,
                    hasCopiedColumns: copiedColumns.length > 0,
                }}
                functions={{
                    toggleTools, eraseColumns, deleteColumns, copyColumns, pasteColumns, resetSelection
                }}
            />
            <div className="song-info">
                <div className='text-ellipsis'>
                    {song.name}
                </div>
                <div>
                    {formatMs(songLength.current)}
                    /
                    {formatMs(songLength.total)}
                </div>
            </div>
        </>
    }
}

//@ts-ignore
export default withRouter(Composer)

