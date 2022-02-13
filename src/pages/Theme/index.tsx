import { useEffect, useState } from "react";
import { ThemeStore } from "stores/ThemeStore";
import { observe } from "mobx";
import { SimpleMenu } from "components/SimpleMenu";
import { capitalize } from "lib/Utils";
import Color from "color";
import { AppButton } from "components/AppButton";
import { FileElement, FilePicker } from "components/FilePicker"
import Main from "pages/Main";
import { HexColorPicker } from "react-colorful";

import './Theme.css'
import { BASE_THEME_CONFIG } from "appConfig";

function Theme() {
    const [theme, setTheme] = useState(ThemeStore)
    const [selected, setSelected] = useState('')
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data, () => {
            setTheme({ ...ThemeStore })
        })
        const dispose2 = observe(ThemeStore.state.other, () => {
            setTheme({ ...ThemeStore })
        })
        return () => {
            dispose()
            dispose2()
        }
    }, [])

    function handleChange(name: string, value: string) {
        ThemeStore.set(name, value)
    }
    function handleImport(file: FileElement[]) {
        if (file.length) ThemeStore.loadFromJson(file[0].data)
    }

    return <div className="default-page">
        <SimpleMenu />
        <div className="default-content">

            <div style={{ display: 'flex' }}>
                <AppButton onClick={ThemeStore.download} style={{ margin: '0.25rem' }}>
                    Download Theme
                </AppButton>
                <FilePicker onChange={handleImport} as='json'>
                    <AppButton style={{ margin: '0.25rem' }}>
                        Import Theme
                    </AppButton>
                </FilePicker>
            </div>
            <div style={{margin: '1rem'}}>
                Press the color that you want to choose, then press save once you are done. 
                <br />
                Use the lower slider if you only want to change the color but keep the tonality.
            </div>
            {theme.toArray().map(e =>
                <ThemePropriety
                    {...e}
                    key={e.name}
                    selected={selected === e.name}
                    onChange={handleChange}
                    setSelectedProp={setSelected}
                    modified={e.value !== theme.baseTheme.data[e.name].value}
                />
            )}
            <div className="theme-row">
                <div>
                    Background image (URL)
                </div>
                <input
                    className="app-button"
                    style={{ width: '9rem' }}
                    placeholder="Write here"
                    value={theme.getOther('backgroundImageMain')}
                    onChange={(e) => ThemeStore.setBackground(e.target.value, 'Main')}
                />
            </div>
            <div className="theme-row">
                <div>
                    Composer Background image (URL)
                </div>
                <input
                    className="app-button"
                    style={{ width: '9rem' }}
                    placeholder="Write here"
                    value={theme.getOther('backgroundImageComposer')}
                    onChange={(e) => ThemeStore.setBackground(e.target.value, 'Composer')}
                />
            </div>
            <div style={{ fontSize: '1.5rem', marginTop: '3rem' }}>
                Preview
            </div>
            <div className="theme-preview">
                <Main />
            </div>
        </div>
    </div>
}


interface ThemeProprietyProps {
    name: string,
    value: string,
    modified: boolean,
    setSelectedProp: (name: string) => void,
    selected: boolean,
    onChange: (name: string, value: string) => void
}

function ThemePropriety({ name, value, onChange, modified, setSelectedProp, selected }: ThemeProprietyProps) {
    const [color, setColor] = useState(Color(value))
    useEffect(() => {
        setColor(Color(value))
    }, [value])

    function handleChange(e: any) {
        setColor(Color(e))
    }
    function sendEvent() {
        onChange(name, color.hex())
        setSelectedProp('')
    }

    return <div
            className={`theme-row ${selected ? 'selected' : ''}`}
            style={selected ? {
                backgroundColor: color.hex(),
                color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
            }: {}}
        >
        <div>
            {capitalize(name.split('_').join(' '))}
        </div>
        <div className="color-input-wrapper">
            {selected
                ? <div className="color-picker">
                    <HexColorPicker onChange={handleChange} color={color.hex()}/>
                </div>
                : <div
                    onClick={() => setSelectedProp(name)}
                    className='color-preview'
                    style={{
                        backgroundColor: ThemeStore.get(name).hex(),
                        color: ThemeStore.getText(name).hex()
                    }}
                >
                    Text
                </div>
            }
            {selected
                ? <button
                    onClick={sendEvent}
                    className={`genshin-button theme-save`}
                >
                    SAVE
                </button>
                : <button
                    onClick={() => ThemeStore.reset(name)}
                    className={`genshin-button theme-reset ${modified ? 'active' : ''}`}
                >
                    RESET
                </button>
            }

        </div>
    </div>
}
export default Theme