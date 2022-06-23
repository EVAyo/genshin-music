import { AppButton } from "components/AppButton"
import { hasTooltip, Tooltip } from "components/Tooltip"
import { useTheme } from "lib/Hooks/useTheme"
import { Column } from "lib/Songs/SongClasses"
import { memo, useState } from "react"
import { FaCopy, FaEraser, FaPaste, FaTrash } from "react-icons/fa"
import { MdPhotoSizeSelectSmall, MdSelectAll } from "react-icons/md"
interface ComposerToolsProps {
    data: {
        isToolsVisible: boolean
        hasCopiedColumns: boolean
        selectedColumns: number[]
        layer: number
        undoHistory: Column[][]
    }
    functions: {
        toggleTools: () => void
        copyColumns: (layer: number | 'all') => void
        eraseColumns: (layer: number | 'all') => void
        pasteColumns: (insert: boolean) => void
        deleteColumns: () => void
        resetSelection: () => void
        undo: () => void
    }
}
type SelectionType = 'layer' | 'all'

//MEMOISED
function ComposerTools({ data, functions }: ComposerToolsProps) {
    const [theme] = useTheme()
    const [selectionType, setSelectionType]  = useState<SelectionType>('all')
    const { toggleTools, copyColumns, eraseColumns, pasteColumns, deleteColumns, resetSelection, undo } = functions
    const { isToolsVisible, hasCopiedColumns, layer, selectedColumns, undoHistory } = data
    return <div
        className={`floating-tools ${isToolsVisible ? "floating-tools tools-visible" : ""}`}
        style={{ backgroundColor: theme.get('menu_background').fade(0.1).toString() }}
    >
        <div className="tools-buttons-wrapper">
            <ToolButton
                area="a"
                disabled={hasCopiedColumns}
                onClick={() => copyColumns(selectionType === 'all' ? 'all' : layer)}
                active={hasCopiedColumns}
                tooltip='Copy all notes'
                style={{flexDirection: 'column'}}
            >
                <FaCopy className='tools-icon' />
                Copy
            </ToolButton>
            <ToolButton
                disabled={!hasCopiedColumns}
                onClick={() => pasteColumns(false)}
                tooltip='Paste copied notes'
                area="b"
            >
                <FaPaste className='tools-icon' />
                Paste
            </ToolButton>
            <ToolButton
                disabled={!hasCopiedColumns}
                onClick={() => pasteColumns(true)}
                tooltip='Insert copied notes'
                area="c"
            >
                <FaPaste className='tools-icon' />
                Insert
            </ToolButton>
            <ToolButton
                disabled={hasCopiedColumns}
                onClick={() => eraseColumns(selectionType === 'all' ? 'all' : layer)}
                tooltip='Erase all selected notes'
                area="d"
            >
                <FaEraser className='tools-icon' />
                Erase
            </ToolButton>

            <ToolButton
                disabled={hasCopiedColumns}
                onClick={deleteColumns}
                tooltip='Delete selected columns'
                area="f"
            >
                <FaTrash className='tools-icon' />
                Delete
            </ToolButton>
        </div>
        <div className="tools-right column">
            <AppButton 
                style={{marginBottom: '0.2rem'}} 
                toggled={selectionType === 'all'}
                onClick={() => setSelectionType('all')}
            >
                <MdSelectAll style={{marginRight: '0.2rem'}} size={16}/>
                All layers 
            </AppButton>
            <AppButton  
                style={{marginBottom: '0.2rem'}}
                toggled={selectionType === 'layer'}
                onClick={() => setSelectionType('layer')}
            >
                <MdPhotoSizeSelectSmall style={{marginRight: '0.2rem'}} size={16}/>
                Only Layer {layer + 1}
            </AppButton>
            <AppButton 
                style={{marginBottom: '0.2rem', justifyContent: 'center'}}
                onClick={resetSelection}
                disabled={selectedColumns.length <= 1 && !hasCopiedColumns}
            >
                Clear selection
            </AppButton>
            <div className="row" style={{ flex: '1', alignItems: 'flex-end'}}>
                <AppButton 
                    style={{flex: '1' , justifyContent: 'center'}} 
                    disabled={undoHistory.length === 0}
                    onClick={undo}
                >
                    Undo
                </AppButton>
                <AppButton onClick={toggleTools} style={{ marginLeft: '0.2rem', flex: '1' , justifyContent: 'center'}}>
                    Ok
                </AppButton>
            </div>
        </div>

    </div>
}

export default memo(ComposerTools, (p, n) => {
    return p.data.isToolsVisible === n.data.isToolsVisible && p.data.hasCopiedColumns === n.data.hasCopiedColumns && p.data.layer === n.data.layer 
    && p.data.selectedColumns === n.data.selectedColumns && p.data.undoHistory === n.data.undoHistory
})

interface ToolButtonprops {
    disabled: boolean
    onClick: () => void
    active?: boolean
    style?: React.CSSProperties
    children: React.ReactNode
    tooltip?: string
    area?: string
}
function ToolButton({ disabled, onClick, active, style, children, tooltip, area }: ToolButtonprops) {
    return <button
        disabled={disabled}
        onClick={onClick}

        className={`flex-centered tools-button ${active ? "tools-button-highlighted" : ""} ${hasTooltip(tooltip)}`}
        style={{gridArea: area,...style}}
    >
        {children}
        {tooltip &&
            <Tooltip position="top">
                {tooltip}
            </Tooltip>
        }
    </button>
}