import { useState } from 'react'
import { SongMenu } from 'components/SongMenu'
import { useSongs } from 'lib/Hooks/useSongs'
import { historyTracker } from 'stores/History'
import { MenuItem } from 'components/MenuItem'
import { FaArrowLeft, FaHome, FaMusic, FaTimes } from 'react-icons/fa'
import HomeStore from 'stores/HomeStore'
import { useHistory } from 'react-router-dom'
import MenuPanel from 'components/MenuPanel'
import { SerializedSong } from 'lib/Songs/Song'
import useClickOutside from 'lib/Hooks/useClickOutside'

interface SheetVisualiserMenuProps {
    currentSong: SerializedSong | null,
    onSongLoaded: (song: SerializedSong) => void,
}

export function SheetVisualiserMenu({ currentSong, onSongLoaded }: SheetVisualiserMenuProps) {
    const [songs] = useSongs()
    const history = useHistory()
    const [selectedPage, setSelectedPage] = useState("")
    const sideClass = selectedPage === 'Songs' ? "side-menu menu-open" : "side-menu"
    const menuRef = useClickOutside<HTMLDivElement>(() => {
        setSelectedPage("")
    }, { ignoreFocusable: true, active: selectedPage !== "" })
    return <div className="menu-wrapper" ref={menuRef}>
        <div className="menu menu-visible" style={{ justifyContent: 'flex-end' }}>
            {(historyTracker.hasNavigated && selectedPage === "") &&
                <MenuItem
                    style={{ marginBottom: 'auto' }}
                    onClick={() => {
                        history.goBack()
                    }}
                >
                    <FaArrowLeft className='icon' />
                </MenuItem>
            }
            {selectedPage !== "" &&
                <MenuItem
                    style={{ marginBottom: 'auto' }}
                    onClick={() => setSelectedPage("")}
                >
                    <FaTimes className="icon" />
                </MenuItem>
            }
            <MenuItem onClick={() => {
                setSelectedPage(selectedPage === "Songs" ? "" : "Songs")
            }}>
                <FaMusic className="icon" />
            </MenuItem>


            <MenuItem onClick={HomeStore.open}>
                <FaHome className="icon" />
            </MenuItem>
        </div>
        <div className={sideClass}>
            <MenuPanel>
                <SongMenu<SongRowProps>
                    songs={songs}
                    className='noprint'
                    SongComponent={SongRow}
                    componentProps={{
                        current: currentSong,
                        onClick: onSongLoaded
                    }}
                />
            </MenuPanel>
        </div>
    </div>
}

interface SongRowProps {
    data: SerializedSong
    current: SerializedSong | null
    onClick: (song: SerializedSong) => void
}
function SongRow({ data, current, onClick }: SongRowProps) {
    const selectedStyle = current === data ? { backgroundColor: 'rgb(124, 116, 106)' } : {}
    return <div
        className="song-row"
        style={selectedStyle}
        onClick={() => onClick(data)}>
        <div className="song-name">
            {data.name}
        </div>
    </div>
}