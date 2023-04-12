//TODO i hate this component with all my heart, the code needs to be improved, but this is the only way to make
//it half performant, maybe i should get rid of react pixi and do it manually, that might improve garbage collection
//since sprites are always removed and added to the stage everytime it scrolls
import { Component, createRef } from 'react'
import { Stage, Container, Graphics, Sprite } from '@pixi/react';
import { FaStepBackward, FaStepForward, FaPlusCircle, FaMinusCircle, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import isMobile from "is-mobile"
import { ComposerCache } from "$/components/Composer/ComposerCache"
import { APP_NAME } from "$/Config"
import Memoized from '$cmp/Utility/Memoized';
import { ThemeProvider } from '$stores/ThemeStore/ThemeProvider';
import { clamp, nearestEven } from '$lib/Utilities';
import type { Column } from '$lib/Songs/SongClasses';
import type { ComposerSettingsDataType } from '$lib/BaseSettings';
import { KeyboardEventData, KeyboardProvider } from '$lib/Providers/KeyboardProvider';
import { isColumnVisible, RenderColumn } from '$cmp/Composer/RenderColumn';
import { TimelineButton } from './TimelineButton';
import { Timer } from '$types/GeneralTypes';
import { ComposedSong } from '$lib/Songs/ComposedSong';
import { subscribeTheme } from '$lib/Hooks/useTheme';

type ClickEventType = 'up' | 'down' | 'downStage'
interface ComposerCanvasProps {
    data: {
        columns: Column[],
        isPlaying: boolean,
        isRecordingAudio: boolean,
        song: ComposedSong
        selected: number,
        currentLayer: number,
        inPreview?: boolean,
        settings: ComposerSettingsDataType,
        breakpoints: number[],
        selectedColumns: number[]
    }
    functions: {
        selectColumn: (index: number, ignoreAudio?: boolean) => void,
        toggleBreakpoint: () => void
    }

}
interface ComposerCanvasState {
    width: number
    height: number
    pixelRatio: number
    numberOfColumnsPerCanvas: number
    column: {
        width: number
        height: number
    }
    timelineHeight: number
    currentBreakpoint: number
    theme: {
        timeline: {
            hex: string
            hexNumber: number
            selected: number
            border: number
        }
        sideButtons: {
            hex: string
            rgb: string
        }
    }
    cache: ComposerCache | null
}
export default class ComposerCanvas extends Component<ComposerCanvasProps, ComposerCanvasState> {
    state: ComposerCanvasState
    notesStageRef: any
    breakpointsStageRef: any
    stageSelected: boolean
    sliderSelected: boolean
    hasSlided: boolean
    stagePreviousPositon: number
    sliderOffset: number
    throttleScroll: number
    onSlider: boolean
    cacheRecalculateDebounce: Timer
    dispose: () => void
    constructor(props: ComposerCanvasProps) {
        super(props)
        const numberOfColumnsPerCanvas = Number(this.props.data.settings.columnsPerCanvas.value)
        const width = 300
        const height = 150
        this.state = {
            width: Math.floor(width),
            height: Math.floor(height),
            pixelRatio: 1.4,
            numberOfColumnsPerCanvas,
            column: {
                width: nearestEven(width / numberOfColumnsPerCanvas),
                height: height
            },
            timelineHeight: 30,
            currentBreakpoint: -1,
            theme: {
                timeline: {
                    hex: ThemeProvider.layer('primary', 0.1).toString(),
                    hexNumber: ThemeProvider.layer('primary', 0.1).rgbNumber(),
                    selected: ThemeProvider.get('composer_accent').negate().rgbNumber(),
                    border: ThemeProvider.get('composer_accent').rgbNumber()
                },
                sideButtons: {
                    hex: ThemeProvider.get('primary').darken(0.08).toString(),
                    rgb: ThemeProvider.get('primary').darken(0.08).rgb().array().map(x => Math.floor(x)).join(",")
                }
            },
            cache: null
        }
        this.notesStageRef = createRef()
        this.breakpointsStageRef = createRef()
        this.stageSelected = false
        this.sliderSelected = false
        this.hasSlided = false
        this.stagePreviousPositon = 0
        this.sliderOffset = 0
        this.throttleScroll = 0
        this.onSlider = false
        this.dispose = () => { }
        //TODO memory leak somewhere in this page
        this.cacheRecalculateDebounce = 0
    }

    componentDidMount() {
        const { numberOfColumnsPerCanvas } = this.state
        const sizes = document.body.getBoundingClientRect()
        let width = nearestEven(sizes.width * 0.85 - 45)
        let height = nearestEven(sizes.height * 0.45)
        if (APP_NAME === "Sky") height = nearestEven(height * 0.95)

        this.setState({
            width: Math.floor(width),
            height: Math.floor(height),
            pixelRatio: window.devicePixelRatio ?? 1.4,
            numberOfColumnsPerCanvas,
            column: {
                width: nearestEven(width / numberOfColumnsPerCanvas),
                height: height
            },
            timelineHeight: isMobile() ? 25 : 30,
        }, () => {
            window.addEventListener("resize", this.recalculateCacheAndSizes)
            this.recalculateCacheAndSizes()
        })
        window.addEventListener("pointerup", this.resetPointerDown)
        KeyboardProvider.listen(this.handleKeyboard)
        this.notesStageRef?.current?._canvas?.addEventListener("wheel", this.handleWheel)
        this.dispose = subscribeTheme(() => {
            this.recalculateCacheAndSizes()
            this.setState({
                theme: {
                    timeline: {
                        hex: ThemeProvider.layer('primary', 0.1).toString(),
                        hexNumber: ThemeProvider.layer('primary', 0.1).rgbNumber(),
                        selected: ThemeProvider.get('composer_accent').negate().rgbNumber(),
                        border: ThemeProvider.get('composer_accent').rgbNumber()
                    },
                    sideButtons: {
                        hex: ThemeProvider.get('primary').darken(0.08).toString(),
                        rgb: ThemeProvider.get('primary').darken(0.08).rgb().array().map(x => Math.floor(x)).join(",")
                    }
                }
            })
        })
    }

    componentWillUnmount() {
        window.removeEventListener("pointerup", this.resetPointerDown)
        window.removeEventListener("resize", this.recalculateCacheAndSizes)
        if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce)
        KeyboardProvider.unlisten(this.handleKeyboard)
        this.notesStageRef?.current?._canvas?.removeEventListener("wheel", this.handleWheel)
        this.dispose()
        this.state.cache?.destroy()
        this.notesStageRef = null
        this.breakpointsStageRef = null
    }
    resetPointerDown = () => {
        this.stageSelected = false
        this.sliderSelected = false
        this.stagePreviousPositon = 0
    }
    recalculateCacheAndSizes = () => {
        if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce)
        this.cacheRecalculateDebounce = setTimeout(() => {
            if (!this.notesStageRef?.current || !this.breakpointsStageRef?.current) return
            const sizes = document.body.getBoundingClientRect()
            const { numberOfColumnsPerCanvas } = this.state
            const { inPreview } = this.props.data
            let width = nearestEven(sizes.width * 0.85 - 45)
            let height = nearestEven(sizes.height * 0.45)
            if (APP_NAME === "Sky") height = nearestEven(height * 0.95)
            if (inPreview) {
                width = nearestEven(width * (sizes.width < 900 ? 0.8 : 0.55))
                height = nearestEven(height * (sizes.width < 900 ? 0.8 : 0.6))
            }
            let columnWidth = nearestEven(width / numberOfColumnsPerCanvas)
            this.setState({
                width: Math.floor(width),
                height: Math.floor(height),
                column: {
                    width: columnWidth,
                    height
                },
                cache: this.getCache(columnWidth, height, isMobile() ? 2 : 4, isMobile() ? 25 : 30),
            })
        }, 50)
    }
    handleKeyboard = ({ code }: KeyboardEventData) => {
        if (code === 'ArrowRight') this.handleBreakpoints(1)
        else if (code === 'ArrowLeft') this.handleBreakpoints(-1)
    }

    getCache(columnWidth: number, height: number, margin: number, timelineHeight: number) {
        const colors = {
            l: ThemeProvider.get('primary'), //light
            d: ThemeProvider.get('primary') //dark
        }
        colors.l = colors.l.luminosity() < 0.05 ? colors.l.lighten(0.4) : colors.l.lighten(0.1)
        colors.d = colors.d.luminosity() < 0.05 ? colors.d.lighten(0.15) : colors.d.darken(0.03)
        if (!this.notesStageRef?.current || !this.breakpointsStageRef?.current) return null
        const newCache = new ComposerCache({
            width: columnWidth,
            height,
            margin,
            timelineHeight,
            app: this.notesStageRef.current.app,
            breakpointsApp: this.breakpointsStageRef.current.app,
            composerAccent: ThemeProvider.get('composer_accent').rotate(20).darken(0.5),
            standardsColors: [
                {
                    color: colors.l.rgbNumber() //lighter
                }, {
                    color: colors.d.rgbNumber() //darker
                }, {
                    color: ThemeProvider.get('composer_accent').rgbNumber() //current
                }, {
                    color: ThemeProvider.get('composer_accent').negate().rgbNumber()
                }
            ]
        })
        this.state.cache?.destroy?.()
        return newCache
    }
    handleWheel = (e: WheelEvent) => {
        this.props.functions.selectColumn(this.props.data.selected + Math.sign(e.deltaY), true)
    }
    handleClick = (e: any, type: ClickEventType) => {
        const x = e.data.global.x
        const { width, numberOfColumnsPerCanvas } = this.state
        const { data } = this.props
        if (type === "up") {
            this.sliderSelected = false
        }
        if (type === "down") {
            this.sliderSelected = true
            const relativeColumnWidth = width / data.columns.length
            const stageSize = relativeColumnWidth * (numberOfColumnsPerCanvas + 1)
            const stagePosition = relativeColumnWidth * data.selected - (numberOfColumnsPerCanvas / 2) * relativeColumnWidth
            this.onSlider = x > stagePosition && x < stagePosition + stageSize
            this.sliderOffset = stagePosition + stageSize / 2 - x
            this.throttleScroll = Number.MAX_SAFE_INTEGER
            this.handleSlide(e)
        }
        if (type === "downStage") {
            this.stagePreviousPositon = x
            this.stageSelected = true
        }
    }
    handleStageSlide = (e: any) => {
        const x = e.data.global.x
        if (this.stageSelected === true) {
            if (this.throttleScroll++ < 5) return
            this.throttleScroll = 0
            const { data, functions } = this.props
            const amount = clamp(Math.ceil(Math.abs(this.stagePreviousPositon - x) / 8), 0, 4)
            const sign = this.stagePreviousPositon < x ? -1 : 1
            this.stagePreviousPositon = x
            const newPosition = data.selected + sign * amount
            if (data.selected === newPosition) return
            functions.selectColumn(clamp(newPosition, 0, data.columns.length - 1), true)
        }
    }
    handleBreakpoints = (direction: 1 | -1) => {
        const { selected, columns, breakpoints } = this.props.data
        const breakpoint = direction === 1 //1 = right, -1 = left
            ? breakpoints.filter((v) => v > selected).sort((a, b) => a - b)
            : breakpoints.filter((v) => v < selected).sort((a, b) => b - a)
        if (breakpoint.length === 0) return
        if (columns.length >= breakpoint[0] && breakpoint[0] >= 0) {
            this.props.functions.selectColumn(breakpoint[0])
        }
    }
    handleSlide = (e: any) => {
        const globalX = e.data.global.x
        if (this.sliderSelected) {
            if (this.throttleScroll++ < 4) return
            const { width, column } = this.state
            const { data } = this.props
            this.hasSlided = true
            this.throttleScroll = 0
            const totalWidth = column.width * data.columns.length
            const x = this.onSlider ? (globalX + this.sliderOffset) : globalX
            const relativePosition = Math.floor(x / width * totalWidth / column.width)
            this.props.functions.selectColumn(relativePosition, true)
        }
    }

    render() {
        const { width, timelineHeight, height, theme, numberOfColumnsPerCanvas, pixelRatio } = this.state
        const { data, functions } = this.props
        const cache = this.state.cache?.cache
        const sizes = this.state.column
        const xPosition = (data.selected - numberOfColumnsPerCanvas / 2 + 1) * - sizes.width
        const beatMarks = Number(data.settings.beatMarks.value)
        const counterLimit = beatMarks === 0 ? 12 : 4 * beatMarks
        const relativeColumnWidth = width / data.columns.length
        const timelineWidth = Math.floor(relativeColumnWidth * (width / sizes.width + 1))
        const timelinePosition = relativeColumnWidth * data.selected - relativeColumnWidth * (numberOfColumnsPerCanvas / 2)
        const isBreakpointSelected = data.breakpoints.includes(data.selected)
        const sideColor = theme.sideButtons.rgb
        return <div className="canvas-wrapper" style={{ width }}>
            <div className='canvas-relative'>
                {!data.settings.useKeyboardSideButtons.value && <>
                    <button
                        onPointerDown={() => functions.selectColumn(data.selected - 1)}
                        className={`canvas-buttons ${!data.isPlaying ? 'canvas-buttons-visible' : ''}`}
                        style={{
                            left: '0',
                            paddingRight: '0.5rem',
                            justifyContent: "flex-start",
                            background: `linear-gradient(90deg, rgba(${sideColor},0.80) 30%, rgba(${sideColor},0.30) 80%, rgba(${sideColor},0) 100%)`
                        }}
                    >
                        <FaChevronLeft />
                    </button>
                    <button
                        onPointerDown={() => functions.selectColumn(data.selected + 1)}
                        className={`canvas-buttons ${!data.isPlaying ? 'canvas-buttons-visible' : ''}`}
                        style={{
                            right: '0',
                            paddingLeft: '0.5rem',
                            justifyContent: "flex-end",
                            background: `linear-gradient(270deg, rgba(${sideColor},0.80) 30%, rgba(${sideColor},0.30) 80%, rgba(${sideColor},0) 100%)`
                        }}
                    >
                        <FaChevronRight />
                    </button>
                </>}


                <Stage
                    width={width}
                    height={height}
                    raf={false}
                    renderOnComponentChange={true}
                    options={{
                        backgroundAlpha: 0,
                        autoDensity: true,
                        resolution: pixelRatio
                    }}
                    ref={this.notesStageRef}
                >
                    {(cache && !data.isRecordingAudio) && <Container
                        x={xPosition}
                        interactive={true}
                        pointerdown={(e) => this.handleClick(e, "downStage")}
                        pointermove={this.handleStageSlide}
                    >
                        {data.columns.map((column, i) => {
                            if (!isColumnVisible(i, data.selected, numberOfColumnsPerCanvas)) return null
                            const tempoChangersCache = (i + 1) % 4 === 0 ? cache.columnsLarger : cache.columns
                            const standardCache = (i + 1) % 4 === 0 ? cache.standardLarger : cache.standard
                            const background = column.tempoChanger === 0
                                ? standardCache[Number(i % (counterLimit * 2) >= counterLimit)]
                                : tempoChangersCache[column.tempoChanger]
                            return <RenderColumn
                                cache={cache}
                                key={i}
                                notes={column.notes}
                                index={i}
                                sizes={sizes}
                                instruments={data.song.instruments}
                                currentLayer={data.currentLayer}
                                backgroundCache={background}
                                isToolsSelected={data.selectedColumns.includes(i)}
                                onClick={functions.selectColumn}
                                isSelected={i === data.selected}
                                isBreakpoint={data.breakpoints.includes(i)}
                            />
                        })}
                    </Container>
                    }
                </Stage>
            </div>
            <div className="timeline-wrapper" style={{ height: this.state.timelineHeight }}>
                <TimelineButton
                    onClick={() => this.handleBreakpoints(-1)}
                    tooltip='Previous Breakpoint'
                    style={{
                        backgroundColor: theme.timeline.hex
                    }}
                    ariaLabel='Previous Breakpoint'
                >
                    <Memoized>
                        <FaStepBackward size={16} />
                    </Memoized>
                </TimelineButton>
                <TimelineButton
                    onClick={() => this.handleBreakpoints(1)}
                    tooltip='Next breakpoint'
                    style={{
                        marginLeft: 0,
                        backgroundColor: theme.timeline.hex
                    }}
                    ariaLabel='Next Breakpoint'
                >
                    <Memoized>
                        <FaStepForward size={16} />
                    </Memoized>
                </TimelineButton>

                <div className='timeline-scroll' style={{ backgroundColor: theme.timeline.hex }}>
                    <Stage
                        width={width}
                        height={timelineHeight}
                        options={{
                            backgroundAlpha: 0,
                            autoDensity: true,
                            resolution: pixelRatio
                        }}
                        raf={false}
                        ref={this.breakpointsStageRef}
                        renderOnComponentChange={true}
                    >
                        {cache && <Container
                            width={width}
                            height={timelineHeight}
                            interactive={true}
                            pointerdown={(e) => this.handleClick(e, "down")}
                            pointerup={(e) => this.handleClick(e, "up")}
                            pointermove={this.handleSlide}
                        >
                            <Graphics //to fill the space
                                draw={(g) => {
                                    g.clear()
                                    g.beginFill(theme.timeline.hexNumber)
                                    g.drawRect(0, 0, width, timelineHeight)
                                }}
                            />
                            {data.selectedColumns.length
                                ? <Graphics
                                    draw={(g) => {
                                        const first = data.selectedColumns[0] || 0
                                        const last = data.selectedColumns[data.selectedColumns.length - 1]
                                        const x = first * relativeColumnWidth
                                        const xEnd = last * relativeColumnWidth
                                        const width = xEnd - x
                                        g.clear()
                                        g.beginFill(theme.timeline.selected, 0.6)
                                        g.drawRect(x, 0, width, timelineHeight)
                                    }}
                                />
                                : null
                            }
                            {data.breakpoints.map(breakpoint =>
                                <Sprite
                                    texture={cache.breakpoints[0]}
                                    key={breakpoint}
                                    anchor={[0.5, 0]}
                                    x={(width / (data.columns.length - 1)) * breakpoint}
                                >
                                </Sprite>
                            )}
                        </Container>
                        }
                        <Graphics //current visible columns
                            draw={(g) => {
                                g.clear()
                                g.lineStyle(3, theme.timeline.border, 0.8)
                                g.drawRoundedRect(0, 0, timelineWidth, timelineHeight - 3, 6)
                            }}
                            x={timelinePosition}
                            y={1.5}
                        />
                    </Stage>
                </div>
                <TimelineButton
                    onClick={functions.toggleBreakpoint}
                    style={{
                        backgroundColor: theme.timeline.hex
                    }}
                    tooltip={isBreakpointSelected ? 'Remove breakpoint' : 'Add breakpoint'}
                    ariaLabel={isBreakpointSelected ? 'Remove breakpoint' : 'Add breakpoint'}
                >
                    <Memoized>
                        {isBreakpointSelected
                            ? <FaMinusCircle key='minus' size={16} />
                            : <FaPlusCircle key='plus' size={16} />
                        }
                    </Memoized>
                </TimelineButton>
            </div>
        </div>
    }
}