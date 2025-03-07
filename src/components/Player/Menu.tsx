import { useCallback, useEffect, useRef, useState } from 'react'
import { FaMusic, FaTimes, FaCog, FaTrash, FaCrosshairs, FaDownload, FaInfo, FaSearch, FaHome, FaPen, FaEllipsisH, FaRegCircle, FaFolder } from 'react-icons/fa';
import { FaDiscord, FaGithub } from 'react-icons/fa';
import { RiPlayListFill } from 'react-icons/ri'
import { FileDownloader, parseSong } from "lib/Tools"
import { APP_NAME, IS_MIDI_AVAILABLE } from "appConfig"
import { PlayerStore } from 'stores/PlayerStore'
import { HelpTab } from 'components/HelpTab'
import { MenuItem } from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'
import DonateButton from 'components/DonateButton'
import LibrarySearchedSong from 'components/LibrarySearchedSong'
import { SongActionButton } from 'components/SongActionButton'
import Analytics from 'lib/Analytics';
import HomeStore from 'stores/HomeStore';
import LoggerStore from 'stores/LoggerStore';
import { AppButton } from 'components/AppButton';
import { SongMenu } from 'components/SongMenu';
import { Link } from 'react-router-dom'
import { SerializedRecordedSong, RecordedSong } from 'lib/Songs/RecordedSong';
import { ComposedSong, SerializedComposedSong } from 'lib/Songs/ComposedSong';
import { SettingUpdate, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { MainPageSettingsDataType } from 'lib/BaseSettings';
import { useTheme } from 'lib/Hooks/useTheme';
import { SearchedSongType } from 'types/GeneralTypes';
import { FileElement, FilePicker } from 'components/FilePicker';
import "./menu.css"
import { ThemeStoreClass } from 'stores/ThemeStore';
import { KeyboardEventData, KeyboardProvider } from 'lib/Providers/KeyboardProvider';
import { hasTooltip, Tooltip } from "components/Tooltip"
import { HelpTooltip } from 'components/HelpTooltip';
import { FloatingDropdown, FloatingDropdownRow, FloatingDropdownText } from 'components/FloatingDropdown';
import { Midi } from '@tonejs/midi';
import { asyncConfirm, asyncPrompt } from 'components/AsyncPrompts';
import { SettingsPane } from 'components/Settings/SettingsPane';
import { SerializedSong, Song } from 'lib/Songs/Song';
import { songsStore } from 'stores/SongsStore';
import { Folder } from 'lib/Folder';
import { useFolders } from 'lib/Hooks/useFolders';
import { folderStore } from 'stores/FoldersStore';
import { useSongs } from 'lib/Hooks/useSongs';
import useClickOutside from 'lib/Hooks/useClickOutside';

interface MenuProps {
    functions: {
        addSong: (song: RecordedSong | ComposedSong) => void
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string) => void
        handleSettingChange: (override: SettingUpdate) => void
        changeVolume: (override: SettingVolumeUpdate) => void
    }
    data: {
        settings: MainPageSettingsDataType
    }
}

export type MenuTabs = 'Help' | 'Library' | 'Songs' | 'Settings' | 'Home'

function Menu({ functions, data }: MenuProps) {
    const [songs] = useSongs()
    const [isOpen, setOpen] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Songs')
    const [searchInput, setSearchInput] = useState('')
    const [searchedSongs, setSearchedSongs] = useState<SearchedSongType[]>([])
    const [searchStatus, setSearchStatus] = useState('')
    const [isPersistentStorage, setPeristentStorage] = useState(false)
    const [theme] = useTheme()
    const [folders] = useFolders()
    const { handleSettingChange, addSong, removeSong, renameSong } = functions
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setOpen(false)
    }, {active: isOpen, ignoreFocusable: true})
    useEffect(() => {
        async function checkStorage() {
            if (navigator.storage && navigator.storage.persist) {
                let isPersisted = await navigator.storage.persisted()
                if (!isPersisted) isPersisted = await navigator.storage.persist()
                setPeristentStorage(isPersisted)
            }
        }
        checkStorage()
    }, [])
    const handleKeyboard = useCallback(({ letter, shift, code }: KeyboardEventData) => {
        //@ts-ignore
        document.activeElement?.blur()
        if (letter === 'M' && shift) setOpen(!isOpen)
        if (code === 'Escape') setOpen(false)
    }, [isOpen])

    useEffect(() => {
        KeyboardProvider.listen(handleKeyboard)
        return () => KeyboardProvider.unlisten(handleKeyboard)
    }, [handleKeyboard])

    function clearSearch() {
        setSearchInput('')
        setSearchStatus('')
        setSearchedSongs([])
    }
    const searchSongs = async () => {
        if (searchStatus === "Searching...") return
        if (searchInput.trim().length === 0) {
            return setSearchStatus('Please write a non empty name')
        }
        setSearchStatus('Searching...')
        const fetchedSongs = await fetch('https://sky-music.herokuapp.com/api/songs?search=' + encodeURI(searchInput))
            .then(data => data.json()) as any
        if (fetchedSongs.error) {
            setSearchStatus('Please write a non empty name')
            return LoggerStore.error(fetchedSongs.error)

        }
        setSearchStatus('success')
        setSearchedSongs(fetchedSongs as SearchedSongType[])
        Analytics.songSearch({ name: searchInput })
    }
    const toggleMenu = (override?: boolean | null) => {
        if (typeof override !== "boolean") override = null
        const newState = override !== null ? override : !isOpen
        setOpen(newState)
    }
    const selectSideMenu = (selection?: MenuTabs) => {
        if (selection === selectedMenu && isOpen) {
            return setOpen(false)
        }
        clearSearch()
        if (selection) setSelectedMenu(selection)
        setOpen(true)
        Analytics.UIEvent('menu', { tab: selection })
    }
    const importSong = (files: FileElement<SerializedSong[] | SerializedSong>[]) => {
        for (const file of files) {
            try {
                const songs = (Array.isArray(file.data) ? file.data : [file.data]) as SerializedSong[]
                for (const song of songs) {
                    addSong(parseSong(song))
                    Analytics.userSongs('import', { name: song?.name, page: 'player' })
                }
            } catch (e) {
                console.error(e)
                if (file.file.name.includes?.(".mid")) {
                    return LoggerStore.error("Midi files should be imported in the composer")
                }
                logImportError()
            }
        }
    }
    const downloadSong = async (song: ComposedSong | RecordedSong | Midi) => {
        if (song instanceof Midi) {
            const agrees = await asyncConfirm(
                `If you use MIDI, the song will loose some information, if you want to share the song with others,
                use the other format (button above). Do you still want to download?`
            )
            if (!agrees) return
            return FileDownloader.download(
                new Blob([song.toArray()], { type: "audio/midi" }),
                song.name + ".mid"
            )
        }
        const songName = song.name
        const converted = [APP_NAME === 'Sky' ? song.toOldFormat() : song.serialize()].map(s => Song.stripMetadata(s))
        FileDownloader.download(JSON.stringify(converted), `${songName}.${APP_NAME.toLowerCase()}sheet.json`)
        LoggerStore.success("Song downloaded")
        Analytics.userSongs('download', { name: songName, page: 'player' })
    }
    const createFolder = useCallback(async () => {
        const name = await asyncPrompt("Write the folder name")
        if (!name) return
        folderStore.createFolder(name)
    }, [])

    const logImportError = useCallback((error?: any) => {
        if (error) console.error(error)
        LoggerStore.error(
            `Error importing song, invalid format (Only supports the ${APP_NAME.toLowerCase()}sheet.json format)`,
            8000
        )
    }, [])
    function downloadAllSongs() {
        try {
            const toDownload = songs.map(song => {
                if (APP_NAME === 'Sky') {
                    if (song.type === 'composed') ComposedSong.deserialize(song as SerializedComposedSong).toOldFormat()
                    if (song.type === 'recorded') RecordedSong.deserialize(song as SerializedRecordedSong).toOldFormat()
                }
                return song
            }).map(s => Song.stripMetadata(s))
            const date = new Date().toISOString().split('T')[0]
            FileDownloader.download(JSON.stringify(toDownload), `${APP_NAME}_Backup_${date}.json`)
            LoggerStore.success("Song backup downloaded")
        } catch (e) {
            console.error(e)
            LoggerStore.error("Error downloading songs")
        }
    }

    const sideClass = isOpen ? "side-menu menu-open" : "side-menu"
    const layer1Color = theme.layer('menu_background', 0.35).lighten(0.2)
    const layer2Color = theme.layer('menu_background', 0.32).desaturate(0.4)
    return <div className="menu-wrapper" ref={menuRef}>
        <div className="menu menu-visible menu-main-page" >
            {isOpen &&
                <MenuItem onClick={toggleMenu} className='close-menu'>
                    <FaTimes className="icon" />
                </MenuItem>
            }
            <MenuItem onClick={() => selectSideMenu("Help")} className="margin-top-auto" isActive={selectedMenu === "Help" && isOpen}>
                <FaInfo className="icon" />
            </MenuItem>
            <MenuItem onClick={() => selectSideMenu("Library")} isActive={selectedMenu === "Library" && isOpen}>
                <RiPlayListFill className='icon' />
            </MenuItem>
            <MenuItem onClick={() => selectSideMenu("Songs")} isActive={selectedMenu === "Songs" && isOpen}>
                <FaMusic className="icon" />
            </MenuItem>
            <MenuItem onClick={() => selectSideMenu("Settings")} isActive={selectedMenu === "Settings" && isOpen}>
                <FaCog className="icon" />
            </MenuItem>
            <MenuItem onClick={HomeStore.open}>
                <FaHome className="icon" />
            </MenuItem>
        </div>
        <div className={sideClass}>
            <MenuPanel title="No selection" current={selectedMenu} id='No selection'>
            </MenuPanel>
            <MenuPanel current={selectedMenu} id='Songs'>
                <div className="songs-buttons-wrapper">
                    <HelpTooltip>
                        <ul>
                            <li>Click the song name to play it</li>
                            <li>
                                You can import songs made by other users (does not accept audio files).
                                Or you can download yours to share
                            </li>
                            <li>To create your song, you can record the notes you play or create one in the composer</li>
                            <li><FaCrosshairs style={{ marginRight: '0.2rem' }} />: Start the practice mode</li>
                            <li><FaRegCircle style={{ marginRight: '0.2rem' }} />: Start the approaching notes mode</li>
                            {IS_MIDI_AVAILABLE &&
                                <li>You can connect a MIDI keyboard to play</li>
                            }

                        </ul>
                    </HelpTooltip>
                    <Link to='Composer' style={{ marginLeft: 'auto' }}>
                        <AppButton>
                            Compose song
                        </AppButton>
                    </Link>
                    <FilePicker<SerializedSong | SerializedSong[]>
                        onChange={importSong}
                        onError={logImportError}
                        as='json'
                        multiple={true}
                    >
                        <AppButton>
                            Import song
                        </AppButton>
                    </FilePicker>

                </div>
                <SongMenu<SongRowProps>
                    songs={songs}
                    style={{ marginTop: '0.6rem' }}
                    SongComponent={SongRow}
                    componentProps={{
                        theme,
                        folders,
                        functions: { removeSong, toggleMenu, downloadSong, renameSong }
                    }}
                />
                <div className='row' style={{ justifyContent: "flex-end" }}>
                    <AppButton onClick={createFolder}>
                        Create folder
                    </AppButton>
                </div>
                <div style={{ marginTop: "auto", paddingTop: '0.5rem', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                    <AppButton
                        style={{ marginLeft: 'auto' }}
                        onClick={downloadAllSongs}

                    >
                        Download all songs (backup)
                    </AppButton>
                </div>
            </MenuPanel>

            <MenuPanel current={selectedMenu} id='Settings'>
                <SettingsPane
                    settings={data.settings}
                    changeVolume={functions.changeVolume}
                    onUpdate={handleSettingChange}
                />
                <div className='settings-row-wrap'>
                    {IS_MIDI_AVAILABLE &&
                        <Link to={'MidiSetup'}>
                            <AppButton style={{ width: 'fit-content' }}>
                                Connect MIDI keyboard
                            </AppButton>
                        </Link>
                    }
                    <Link to={'Theme'}>
                        <AppButton style={{ width: 'fit-content' }}>
                            Change app theme
                        </AppButton>
                    </Link>
                </div>
                <div style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }}>
                    {isPersistentStorage ? "Storage is persisted" : "Storage is not persisted"}
                </div>
                <DonateButton />
            </MenuPanel>

            <MenuPanel title="Library" current={selectedMenu} id='Library'>
                <div>
                    Here you can find songs to learn, they are provided by the sky-music library.
                </div>
                <div className='library-search-row' >
                    <input
                        className='library-search-input'
                        style={{ backgroundColor: layer1Color.toString() }}
                        placeholder='Song name'
                        onKeyDown={(e) => {
                            if (e.code === "Enter") searchSongs()
                        }}
                        onInput={(e: any) => setSearchInput(e.target.value)}
                        value={searchInput}
                    />
                    <button
                        className='library-search-btn'
                        onClick={clearSearch}
                        style={{ backgroundColor: layer1Color.toString() }}
                    >
                        <FaTimes />
                    </button>
                    <button
                        className='library-search-btn'
                        onClick={searchSongs}
                        style={{ backgroundColor: layer1Color.toString() }}
                    >
                        <FaSearch />
                    </button>
                </div>
                <div className='library-search-songs-wrapper' style={{ backgroundColor: layer2Color.toString() }}>
                    {searchStatus === "success" ?
                        searchedSongs.length > 0
                            ? searchedSongs.map(song =>
                                <LibrarySearchedSong
                                    theme={theme}
                                    key={song.file}
                                    data={song}
                                    importSong={addSong}
                                    onClick={PlayerStore.play}
                                />
                            )
                            : <div className='library-search-result-text'>
                                No results
                            </div>
                        : <div className='library-search-result-text'>
                            {searchStatus}
                        </div>
                    }
                </div>
            </MenuPanel>
            <MenuPanel title="Help" current={selectedMenu} id='Help'>
                <div className='help-icon-wrapper'>
                    <a href='https://discord.gg/Arsf65YYHq' >
                        <FaDiscord className='help-icon' />
                    </a>
                    <a href='https://github.com/Specy/genshin-music' >
                        <FaGithub className='help-icon' />
                    </a>
                </div>
                <HelpTab />
                <DonateButton />
            </MenuPanel>
        </div>
    </div>
}



interface SongRowProps {
    data: SerializedSong
    theme: ThemeStoreClass
    folders: Folder[]
    functions: {
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string,) => void
        toggleMenu: (override?: boolean) => void
        downloadSong: (song: RecordedSong | ComposedSong | Midi) => void
    }
}

function SongRow({ data, functions, theme, folders }: SongRowProps) {
    const { removeSong, toggleMenu, downloadSong, renameSong } = functions
    const buttonStyle = { backgroundColor: theme.layer('primary', 0.15).hex() }
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={() => {
            if (isRenaming) return
            PlayerStore.play(parseSong(data), 0)
            toggleMenu(false)
        }}>
            {isRenaming
                ? <input
                    className={`song-name-input ${isRenaming ? "song-rename" : ""}`}
                    disabled={!isRenaming}
                    onChange={(e) => setSongName(e.target.value)}
                    style={{ width: "100%", color: "var(--primary-text)" }}
                    value={songName}
                />
                : <div style={{ marginLeft: '0.3rem' }}>
                    {songName}
                </div>
            }
            <Tooltip>
                {isRenaming ? "Song name" : "Play song"}
            </Tooltip>
        </div>


        <div className="song-buttons-wrapper">
            <SongActionButton
                onClick={() => {
                    const parsed = parseSong(data)
                    PlayerStore.practice(parsed, 0, parsed.notes.length)
                    toggleMenu(false)
                }}
                tooltip='Practice'
                style={buttonStyle}
            >
                <FaCrosshairs />
            </SongActionButton>

            <SongActionButton onClick={() => {
                const parsed = parseSong(data)
                PlayerStore.approaching(parsed, 0, parsed.notes.length)
                toggleMenu(false)

            }}
                tooltip='Approach mode'
                style={buttonStyle}
            >
                <FaRegCircle />
            </SongActionButton>
            <FloatingDropdown
                Icon={FaEllipsisH}
                style={buttonStyle}
                ignoreClickOutside={isRenaming}
                tooltip="More options"
                onClose={() => setIsRenaming(false)}
            >
                <FloatingDropdownRow
                    onClick={() => {
                        if (isRenaming) {
                            renameSong(songName, data.id!)
                            setIsRenaming(false)
                        }
                        setIsRenaming(!isRenaming)
                    }}
                >
                    <FaPen style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text={isRenaming ? "Save" : "Rename"} />
                </FloatingDropdownRow>
                <FloatingDropdownRow style={{ padding: '0 0.4rem' }}>
                    <FaFolder style={{ marginRight: "0.4rem" }} />
                    <select className='dropdown-select'
                        value={data.folderId || "_None"}
                        onChange={(e) => {
                            const id = e.target.value
                            songsStore.addSongToFolder(data, id !== "_None" ? id : null)
                        }}
                    >
                        <option value={"_None"}>
                            None
                        </option>
                        {folders.map(folder =>
                            <option key={folder.id} value={folder.id!}>{folder.name}</option>
                        )}
                    </select>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => downloadSong(parseSong(data))}>
                    <FaDownload style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Download' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => downloadSong(parseSong(data).toMidi())}>
                    <FaDownload style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Download MIDI' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => removeSong(data.name, data.id!)}>
                    <FaTrash color="#ed4557" style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Delete' />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}


export default Menu