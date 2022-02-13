import { Component } from 'react'
import { FaMusic, FaTimes, FaCog, FaTrash, FaCrosshairs, FaDownload, FaInfo, FaSearch, FaHome } from 'react-icons/fa';
import { FaDiscord, FaGithub } from 'react-icons/fa';
import { BsCircle } from 'react-icons/bs'
import { RiPlayListFill } from 'react-icons/ri'
import { FileDownloader, prepareSongImport, prepareSongDownload } from "lib/Utils"
import { FilePicker } from "react-file-picker"
import { appName, isTwa, isMidiAvailable } from "appConfig"
import { SongStore } from 'stores/SongStore'
import { HelpTab } from 'components/HelpTab'
import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'
import SettingsRow from 'components/SettingsRow'
import DonateButton from 'components/DonateButton'
import LibrarySearchedSong from 'components/LibrarySearchedSong'
import Analytics from 'lib/Analytics';
import HomeStore from 'stores/HomeStore';
import LoggerStore from 'stores/LoggerStore';
import { AppButton } from 'components/AppButton';
import { SongMenu } from 'components/SongMenu';
import "./menu.css"
import { ThemeStore } from 'stores/ThemeStore';
import { observe } from 'mobx';
class Menu extends Component {
    constructor(props) {
        super(props)
        this.state = {
            open: false,
            selectedMenu: "Songs",
            searchInput: '',
            searchedSongs: [],
            searchStatus: 'Write a song name then search!',
            isPersistentStorage: false,
            theme: ThemeStore
        }
        this.dispose = () => {}
    }
    componentDidMount() {
        this.checkPersistentStorage()
        window.addEventListener("keydown", this.handleKeyboard)
        this.dispose = observe(ThemeStore.state.data,() => {
            this.setState({theme: {...ThemeStore}})
        })
    }
    componentWillUnmount() {
        window.removeEventListener("keydown", this.handleKeyboard)
        this.dispose()
    }
    handleKeyboard = (event) => {
        let key = event.code
        if (document.activeElement.tagName === "INPUT") return
        document.activeElement?.blur()
        if (event.shiftKey) {
            switch (key) {
                case "KeyM": {
                    this.setState({ open: !this.state.open })
                    break
                }
                default: break;
            }
        } else {
            switch (key) {
                case "Escape": {
                    this.setState({ open: false })
                    break
                }
                default: break;
            }
        }

    }
    checkPersistentStorage = async () => {
        if (navigator.storage && navigator.storage.persist) {
            let isPersisted = await navigator.storage.persisted()
            if (!isPersisted) isPersisted = await navigator.storage.persist()
            this.setState({ isPersistentStorage: isPersisted })
        }
    }
    handleSearchInput = (text) => {
        this.setState({
            searchInput: text
        })
    }
    clearSearch = () => {
        this.setState({
            searchInput: '',
            searchedSongs: [],
            searchStatus: 'Write a song name then search!'
        })
    }
    searchSongs = async () => {
        const { searchInput, searchStatus } = this.state
        if (searchStatus === "Searching...") return
        if (searchInput.trim().length === 0) {
            return this.setState({
                searchStatus: 'Please write a non empty name'
            })
        }
        this.setState({
            searchStatus: 'Searching...'
        })
        let fetchedSongs = await fetch('https://sky-music.herokuapp.com/api/songs?search=' + encodeURI(searchInput)).then(data => data.json())
        if (fetchedSongs.error) {
            this.setState({
                searchStatus: 'Please write a non empty name'
            })
            return LoggerStore.error(fetchedSongs.error)
            
        }
        this.setState({
            searchedSongs: fetchedSongs,
            searchStatus: 'success'
        })
		Analytics.songSearch({name: searchInput})

    }
    toggleMenu = (override) => {
        if (typeof override !== "boolean") override = undefined
        let newState = override !== undefined ? override : !this.state.open
        this.setState({
            open: newState,
        })
    }
    selectSideMenu = (selection) => {
        if (selection === this.state.selectedMenu && this.state.open) {
            return this.setState({
                open: false,
            })
        }
        this.clearSearch()
        this.setState({
            selectedMenu: selection,
            open: true
        })
        Analytics.UIEvent('menu',{tab: selection})
    }
    importSong = (file) => {
        const reader = new FileReader();
        reader.addEventListener('load', async (event) => {
            try {
                let songsInput = JSON.parse(event.target.result)
                if (!Array.isArray(songsInput)) songsInput = [songsInput]
                for (let song of songsInput) {
                    song = prepareSongImport(song)
                    await this.props.functions.addSong(song)
                    Analytics.userSongs({name: song?.name, page: 'player'},'import')
                }
            } catch (e) {
                console.error(e)
                if (file?.name?.includes?.(".mid")) {
                    return LoggerStore.error("Midi files should be imported in the composer")
                }
                new LoggerStore.error(
                    `Error importing song, invalid format (Only supports the ${appName.toLowerCase()}sheet.json format)`
                )
            }
        })
        reader.readAsText(file)
    }
    downloadSong = (song) => {
        if (song._id) delete song._id
        const name = song.name
        if (appName === "Sky") {
            //adds old format into the sheet
            song = prepareSongDownload(song)
        }
        if (!Array.isArray(song)) song = [song]
        song.forEach(song1 => {
            song1.data.appName = appName
        })
        const json = JSON.stringify(song)
        new FileDownloader().download(json, `${name}.${appName.toLowerCase()}sheet.json`)
        LoggerStore.success("Song downloaded")
        Analytics.userSongs({name: name, page: 'player'},'download')
    }

    downloadAllSongs = () => {
        const toDownload = []
        this.props.data.songs.forEach(song => {
            if (song._id) delete song._id
            if (appName === "Sky") {
                song = prepareSongDownload(song)
            }
            Array.isArray(song) ? toDownload.push(...song) : toDownload.push(song)
        })
        const json = JSON.stringify(toDownload)
        const date = new Date().toISOString().split('T')[0]
        new FileDownloader().download(json, `${appName}_Backup_${date}.json`)
        LoggerStore.success("Song backup downloaded")
    }

    render() {
        const sideClass = this.state.open ? "side-menu menu-open" : "side-menu"
        const { data, functions } = this.props
        const { handleSettingChange, changePage, addSong } = functions
        functions.toggleMenu = this.toggleMenu
        functions.downloadSong = this.downloadSong
        const { searchStatus, searchedSongs, selectedMenu, theme } = this.state 
        const layer1Color = theme.layer('menu_background',0.2)
        const layer2Color = theme.layer('menu_background',0.3).desaturate(0.3)
        return <div className="menu-wrapper">
            <div className="menu menu-visible menu-main-page" >
                {this.state.open &&                 
                    <MenuItem action={this.toggleMenu} className='close-menu'>
                        <FaTimes className="icon" />
                    </MenuItem>
                }
                <MenuItem type="Help" action={this.selectSideMenu} className="margin-top-auto">
                    <FaInfo className="icon" />
                </MenuItem>
                <MenuItem type="Library" action={this.selectSideMenu}>
                    <RiPlayListFill className='icon' />
                </MenuItem>
                <MenuItem type="Songs" action={this.selectSideMenu} >
                    <FaMusic className="icon" />
                </MenuItem>
                <MenuItem type="Settings" action={this.selectSideMenu}>
                    <FaCog className="icon" />
                </MenuItem>
                <MenuItem type="Home" action={HomeStore.open}>
                    <FaHome className="icon" />
                </MenuItem>
            </div>
            <div className={sideClass}>
                <MenuPanel title="No selection" visible={selectedMenu}>
                </MenuPanel>
                <MenuPanel title="Songs" visible={selectedMenu}>
                    <div className="songs-buttons-wrapper">
                        <button className="genshin-button"
                            onClick={() => changePage("Composer")}
                        >
                            Compose song
                        </button>
                        <FilePicker
                            onChange={(file) => this.importSong(file)}
                        >
                            <button className="genshin-button">
                                Import song
                            </button>
                        </FilePicker>

                    </div>
                    <SongMenu 
                        songs={data.songs}
                        SongComponent={SongRow}
                        componentProps={{
                            functions
                        }}
                    />
                    <div style={{ marginTop: "auto", paddingTop: '0.5rem', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className='genshin-button'
                            style={{ marginLeft: 'auto' }}
                            onClick={this.downloadAllSongs}
                        >
                            Download all songs (backup)
                        </button>
                    </div>
                </MenuPanel>

                <MenuPanel title="Settings" visible={selectedMenu}>
                    {Object.entries(data.settings).map(([key, data]) => {
                        return <SettingsRow
                            key={key}
                            objKey={key}
                            data={data}
                            changeVolume={functions.changeVolume}
                            update={handleSettingChange}
                        />
                    })}
                    <div className='settings-row-wrap'>
                        <AppButton 
                            onClick={() => changePage('Theme')} 
                            style={{width:'fit-content'}}
                        >
                            Change app theme
                        </AppButton>
                        {isMidiAvailable && 
                            <button 
                                className='genshin-button' 
                                onClick={() => changePage('MidiSetup')} 
                                style={{width:'fit-content'}}
                            >
                                Connect MIDI keyboard
                            </button>
                        }
                    </div>                    
                    <div style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }}>
                        {this.state.isPersistentStorage ? "Storage is persisted" : "Storage is not persisted"}
                    </div>
                    {!isTwa() && <DonateButton onClick={changePage} />}

                </MenuPanel>

                <MenuPanel title="Library" visible={selectedMenu}>
                    <div>
                        Here you can find songs to learn, they are provided by the sky-music library.
                    </div>
                    <div className='library-search-row' style={{}} >
                        <input
                            className='library-search-input'
                            style={{backgroundColor: layer1Color.hex()}}
                            placeholder='Song name'
                            onKeyDown={(e) => {
                                if (e.code === "Enter") this.searchSongs()
                            }}
                            onInput={(e) => this.handleSearchInput(e.target.value)}
                            value={this.state.searchInput}
                        />
                        <button 
                            className='library-search-btn' 
                            onClick={this.clearSearch}
                            style={{backgroundColor: layer1Color.hex()}}
                        >
                            <FaTimes />
                        </button>
                        <button 
                            className='library-search-btn' 
                            onClick={this.searchSongs}
                            style={{backgroundColor: layer1Color.hex()}}
                        >
                            <FaSearch />
                        </button>
                    </div>
                    <div className='library-search-songs-wrapper' style={{backgroundColor: layer2Color.hex()}}>
                        {searchStatus === "success" ?
                            searchedSongs.length > 0
                                ? searchedSongs.map(song =>
                                    <LibrarySearchedSong
                                        key={song.file}
                                        data={song}
                                        functions={{importSong: addSong}}
                                    >
                                        {song.name}
                                    </LibrarySearchedSong>)
                                : <div className='library-search-result-text'>
                                    No results
                                </div>
                            : <div className='library-search-result-text'>
                                {searchStatus}
                            </div>
                        }
                    </div>
                </MenuPanel>
                <MenuPanel title="Help" visible={selectedMenu}>
                    <div className='help-icon-wrapper'>
                        <a href='https://discord.gg/Arsf65YYHq' >
                            <FaDiscord className='help-icon' />
                        </a>
                        <a href='https://github.com/Specy/genshin-music' >
                            <FaGithub className='help-icon' />
                        </a>
                    </div>
                    <HelpTab />
                    {!isTwa() && <DonateButton onClick={changePage} />}
                </MenuPanel>
            </div>
        </div>
    }
}

function SongRow({data, functions}) {
    const { removeSong, toggleMenu, downloadSong} = functions

    return <div className="song-row">
        <div className="song-name" onClick={() => {
            SongStore.play(data, 0)
            toggleMenu(false)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => {
                SongStore.practice(data, 0, data?.notes?.length)
                toggleMenu(false)
            }}
            >
                <FaCrosshairs />
            </button>

            <button className="song-button" onClick={() => {
                SongStore.approaching(data, 0, data?.notes?.length)
                toggleMenu(false)
            }}
            >
                <BsCircle />
            </button>
            <button className="song-button" onClick={() => downloadSong(data)}>
                <FaDownload />

            </button>
            <button className="song-button" onClick={() => removeSong(data.name)}>
                <FaTrash color="#ed4557" />
            </button>
        </div>
    </div>
}



export default Menu