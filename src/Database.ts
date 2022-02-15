import ZangoDb from "zangodb"
import { appName } from "appConfig"
import { Theme } from "stores/ThemeStore"

function generateId(){
    const s4 = () => {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16) 
            .substring(1)
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4()
}

class Database{
    db: ZangoDb.Db
    collections:{
        songs:ZangoDb.Collection,
        themes:ZangoDb.Collection
    }
    constructor(){
        //@ts-ignore
        this.db = new ZangoDb.Db(appName,2, { songs: [], themes: [] })
        this.collections = {
            songs: this.db.collection("songs"),
            themes: this.db.collection("themes")
        }
    }
    getSongs(){
        return this.collections.songs.find({}).toArray()
    }
    getSongById(id:string){
        return this.collections.songs.findOne({_id: id})
    }
    existsSong(query:any){
        return this.collections.songs.findOne(query) !== undefined
    }
    updateSong(query:any,data:any){
        return this.collections.songs.update(query, data)
    }
    addSong(song:any){
        return this.collections.songs.insert(song)
    }
    removeSong(query:any){
        return this.collections.songs.remove(query)
    }
    async getTheme({query}:any):Promise<Theme>{
        const theme = await this.collections.themes.findOne(query) as Theme
        //@ts-ignore
        delete theme.id
        //@ts-ignore
        delete theme._id
        return theme
    }
    async getThemes(): Promise<Theme[]>{
        const themes = (await this.collections.themes.find({}).toArray()) as Theme[]
        themes.forEach(theme => {
            //@ts-ignore
            delete theme.id
            //@ts-ignore
            delete theme._id
        })
        return themes
    }
    async addTheme(theme:Theme){
        const id = generateId()
        theme.other.id = id
        await this.collections.themes.insert({...theme, id })
        return id
    }
    updateTheme(query:any,data:Theme){
        return this.collections.themes.update(query,data)
    }
    removeTheme(query:any){
        return this.collections.themes.remove(query)
    }
}

const DB = new Database()
export {
    Database,
    DB
}