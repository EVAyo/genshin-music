import { APP_NAME, PITCHES, Pitch, TEMPO_CHANGERS, NOTE_SCALE, PITCH_TO_INDEX, BaseNote } from "$/Config"
import * as workerTimers from 'worker-timers';
import { Column, RecordedNote } from "./Songs/SongClasses";
import { ColumnNote } from "./Songs/SongClasses";
import { NoteLayer } from "./Layer";
import { Song } from "./Songs/Song";
import { ComposedSong } from "./Songs/ComposedSong";
import { RecordedSong } from "./Songs/RecordedSong";
import { ClickType, Timer } from "$types/GeneralTypes"


class FileDownloader {
	static download(file: string | Blob, name: string, as: string = "text/json") {
		const a = document.createElement("a")
		a.style.display = 'none'
		a.className = 'ignore_click_outside'
		a.download = name
		document.body.appendChild(a)

		if (typeof file === "string") {
			a.href = `data:${as};charset=utf-8,${encodeURIComponent(file)}`
			a.click();
		}
		if (file instanceof Blob) {
			const url = URL.createObjectURL(file)
			a.href = url
			a.click();
			URL.revokeObjectURL(url)
		}
		a.remove();
	}
}


export function isTWA() {
    return JSON.parse(sessionStorage?.getItem('isTwa') || 'null')
}




class MIDINote {
	index: number
	midi: number
	status: 'wrong' | 'right' | 'clicked'
	constructor(index: number = 0, midi: number = 0) {
		this.index = index
		this.midi = midi
		this.status = midi < 0 ? 'wrong' : 'right'
	}
}

class MIDIShortcut {
	type: string
	midi: number
	status: 'wrong' | 'right' | 'clicked'
	constructor(type: string, midi: number) {
		this.type = type
		this.midi = midi
		this.status = midi < 0 ? 'wrong' : 'right'
	}
}

function groupArrayEvery<T>(array: T[], n: number) {
	let groups: T[][] = []
	for (let i = 0; i < array.length; i += n) {
		groups.push(array.slice(i, i + n))
	}
	return groups
}

function getNearestTo(num: number, lower: number, upper: number) {
	return Math.abs(num - lower) < Math.abs(num - upper) ? lower : upper
}

function isNumberBetween(num: number, min: number, max: number) {
	return num >= min && num <= max
}
function isNumberCloseTo(num: number, target: number, range: number) {
	return num >= target - range && num <= target + range
}

function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function blurEvent(e: any) {
	//@ts-ignore
	e?.target?.blur?.()
}


function isFocusable(el: HTMLElement | EventTarget | null | undefined){
	const focusableElements = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'];
	if(!el) return false
	//@ts-ignore
	return focusableElements.includes(el.tagName)
}

function parseMouseClick(event: number){
	if(event === 0) return ClickType.Left
	if(event === 2) return ClickType.Right
	return ClickType.Unknown
}
class Array2d {
	static from(height: number) {
		return new Array(height).fill(0).map(() => { return [] })
	}
}
function insertionSort<T>(array: T[], compare: (a: T, b: T) => number) {
	let n = array.length;
	for (let i = 1; i < n; i++) {
		let current = array[i];
		let j = i - 1;
		while ((j > -1) && (compare(current, array[j]) < 0)) {
			array[j + 1] = array[j];
			j--;
		}
		array[j + 1] = current;
	}
	return array;
}

function isComposedOrRecorded(song: Song){
	return song instanceof ComposedSong || song instanceof RecordedSong
}
function formatMs(ms: number) {
	const minutes = Math.floor(ms / 60000);
	const seconds = Number(((ms % 60000) / 1000).toFixed(0))
	return (
		seconds === 60
			? (minutes + 1) + ":00"
			: minutes + ":" + (seconds < 10 ? "0" : "") + seconds
	)
}

function setIfInTWA() {
	if (isTWA()) return console.log('inTWA')
	const isInTwa = document.referrer.includes('android-app://')
	sessionStorage.setItem('isTwa', JSON.stringify(isInTwa))
}


//TODO improve this detection
function getSongType(song: any): 'oldSky' | 'none' | 'newComposed' | 'newRecorded' | 'vsrg' {
	try {
		if (song.data === undefined) {
			//oldSky format
			song.pitchLevel = song.pitchLevel || 0
			if (song.songNotes !== undefined) {
				return "oldSky"
			}
		} else {
			//current format
			if(song.type === 'vsrg') return 'vsrg'
			if (song.type === 'composed' || song.data.isComposedVersion === true) {
				if (Array.isArray(song.columns)) {
					return "newComposed"
				} else {
					return "none"
				}
			}
			if (song.type === 'recorded' || song.data.isComposedVersion === false) {
				if (Array.isArray(song.notes)) {
					return "newRecorded"
				} else {
					return "none"
				}
			}
		}
	} catch (e) {
		console.log(e)
		return "none"
	}
	return "none"
}

type ConditionalClass = [condition:boolean, trueClass: string, falseClass?: string] | string
export function cn(...args: ConditionalClass[]){
	const result = args.map(a => {
		if(typeof a === 'string') return a
		return a[0] ? a[1] : (a[2] ?? '') 
	}).join(' ')
	return result
}

function groupByNotes(notes: RecordedNote[], threshold: number) {
	const result = []
	while (notes.length > 0) {
		const row = [notes.shift() as RecordedNote]
		let amount = 0
		for (let i = 0; i < notes.length; i++) {
			if (row[0].time > notes[i].time - threshold) amount++
		}
		result.push([...row, ...notes.splice(0, amount)])
	}
	return result
}

const pitchMap = new Map(PITCHES.map((pitch, i) => [pitch, i]))
function getPitchChanger(pitch: Pitch) {
	const index = pitchMap.get(pitch) ?? 0
	return Number(Math.pow(2, index / 12).toFixed(4))
}
function calculateSongLength(columns: Column[], bpm: number, end: number) {
	const msPerBeat = Math.floor(60000 / bpm)
	let totalLength = 0
	let currentLength = 0
	let increment = 0
	for (let i = 0; i < columns.length; i++) {
		increment = msPerBeat * TEMPO_CHANGERS[columns[i].tempoChanger].changer
		if (i < end) currentLength += increment
		totalLength += increment
	}
	return {
		total: totalLength,
		current: currentLength
	}
}

function mergeLayers(notes: ColumnNote[]) {
	const merged = new NoteLayer()
	notes.forEach(note => {
		note.layer.toArray().forEach((e, i) => {
			if (e === 1) merged.set(i, true)
		})
	})
	return merged
}


function groupNotesByIndex(column: Column) {
	const notes: ColumnNote[][] = []
	column.notes.forEach(note => {
		if (notes[note.index]) {
			notes[note.index].push(note)
		} else {
			notes[note.index] = [note]
		}
	})
	return notes.filter(e => Array.isArray(e))
}

function delay(ms: number) {
	return new Promise(resolve => {
		workerTimers.setTimeout(resolve, ms)
	})
}

function nearestEven(num: number) {
	return 2 * Math.round(num / 2);
}

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);
export type Debouncer = (func: () => void) => void
function createDebouncer(delay:number): Debouncer{
    let timeoutId:Timer
    return function(callback:() => void){
        clearTimeout(timeoutId)
        timeoutId = setTimeout(callback, delay)
    }
}

export {
	FileDownloader,
	getPitchChanger,
	getSongType,
	groupByNotes,
	mergeLayers,
	groupNotesByIndex,
	delay,
	Array2d,
	MIDINote,
	MIDIShortcut,
	capitalize,
	clamp,
	createDebouncer,
	nearestEven,
	formatMs,
	calculateSongLength,
	setIfInTWA,
	blurEvent,
	insertionSort,
	isComposedOrRecorded,
	isFocusable,
	parseMouseClick,
	groupArrayEvery,
	isNumberBetween,
	isNumberCloseTo,
	getNearestTo
}