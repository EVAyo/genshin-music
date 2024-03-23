import {APP_NAME} from "$config"
import {ComposedSong} from "$lib/Songs/ComposedSong"
import {RecordedSong} from "$lib/Songs/RecordedSong"
import {extractStorable, SerializedSong, Song, SongStorable} from "$lib/Songs/Song"
import {VsrgSong} from "$lib/Songs/VsrgSong"
import {getSongType} from "$lib/Utilities"
import {AppError} from "../Errors"
import {DbInstance} from "./Database/Database"
import {settingsService} from "./SettingsService"


//TODO instead of using SerializedSong, switch to SerializedSongKind
class SongService {
    songCollection = DbInstance.collections.songs

    async getStorableSongs(): Promise<SongStorable[]> {
        const songs = await this.getSongs()
        return songs.map(extractStorable)
    }

    async getSongs(): Promise<SerializedSong[]> {
        const songs = await this.songCollection.find({})
        const migrationEnsured = await this.ensureMigration(songs)
        return migrationEnsured.map(this.stripDbId)
    }

    private async ensureMigration(songs: SerializedSong[]) {
        const migratedId = songs.map(song => {
            return new Promise(async resolve => {
                let hasChanges = false
                if (song.id === undefined || song.id === null) {
                    song.id = DbInstance.generateId()
                    song.type = Song.getSongType(song)!
                    song.folderId = null
                    await this.songCollection.update({name: song.name}, song)
                    hasChanges = true
                }
                if (song.folderId === undefined) song.folderId = null
                if (!song.type) song.type = Song.getSongType(song)!
                resolve(hasChanges)
            })
        })
        const changes = await Promise.all(migratedId)
        //if every song was already migrated
        if (!changes.some(change => change)) return songs
        //if some songs were not migrated
        return this.songCollection.find({})
    }


    private stripDbId(song: SerializedSong) {
        //@ts-ignore
        delete song._id
        return song
    }

    async getOneSerializedFromStorable(storable: SongStorable): Promise<SerializedSong | null> {
        if (storable.id === null) {
            console.error("ERROR: Storable id is null, this should not happen")
            return null
        }
        const song = await this.getSongById(storable.id)
        if (!song) console.error("ERROR: Storable song not found, this should not happen")
        return song
    }

    getManySerializedFromStorable(storables: SongStorable[]): Promise<(SerializedSong | null)[]> {
        const promises = storables.map(storable => this.getOneSerializedFromStorable(storable))
        return Promise.all(promises)
    }

    async songExists(id: string): Promise<boolean> {
        return (await this.getSongById(id)) !== null
    }

    async getSongById(id: string): Promise<SerializedSong | null> {
        const song = await this.songCollection.findOneById(id)
        if (song) return this.stripDbId(song)
        return null
    }

    updateSong(id: string, data: SerializedSong) {
        settingsService.setLastStateEdit(Date.now())
        return this.songCollection.updateById(id, data)
    }

    async renameSong(id: string, newName: string) {
        const song = await this.getSongById(id)
        if (song === null) return
        song.name = newName
        return this.updateSong(id, song)
    }

    async addSong(song: SerializedSong) {
        const id = DbInstance.generateId()
        song.id = id
        await this.songCollection.insert(song)
        settingsService.setLastStateEdit(Date.now())
        return id
    }

    _clearAll() {
        return this.songCollection.remove({})
    }

    async fromStorableSong(s: SongStorable): Promise<ComposedSong | RecordedSong | VsrgSong> {
        const song = await this.getOneSerializedFromStorable(s)
        if (song === null) throw new Error("Error: Song not found")
        return this.parseSong(song)
    }

    //TODO not sure this is the best place for this
    parseSong(song: any): ComposedSong | RecordedSong | VsrgSong {
        song = Array.isArray(song) ? song[0] : song
        const type = getSongType(song)
        if (type === "none") {
            throw new Error("Error Invalid song")
        }
        if (type === "oldSky") {
            const parsed = RecordedSong.fromOldFormat(song)
            if (parsed === null) {
                throw new Error("Error parsing old format song")
            }
            return parsed
        }
        if (APP_NAME === 'Sky' && song.data?.appName !== 'Sky') {
            throw new Error("Error Invalid song, it's not a Sky song")
        }
        if (APP_NAME === 'Genshin' && song.data?.appName === 'Sky') {
            if (song.type === 'vsrg') return VsrgSong.deserialize(song).toGenshin()
            //always put those below because of the legacy format
            if (song.type === 'composed' || song.data?.isComposedVersion === true) return ComposedSong.deserialize(song).toGenshin()
            if (song.type === 'recorded' || song.data?.isComposedVersion === false) return RecordedSong.deserialize(song).toGenshin()
        }
        if (type === 'vsrg') return VsrgSong.deserialize(song)
        if (type === 'newComposed') return ComposedSong.deserialize(song)
        if (type === 'newRecorded') return RecordedSong.deserialize(song)
        throw new AppError("Error Invalid song")
    }

    removeSong(id: string) {
        return this.songCollection.removeById(id)
    }
}

const _songService = new SongService()

export {
    _songService as songService
}