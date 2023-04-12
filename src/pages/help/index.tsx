import { HelpTab } from "$cmp/HelpTab"
import { DefaultPage } from "$cmp/Layout/DefaultPage"
import { Title } from "$cmp/Miscellaneous/Title"

export default function Help(){
    return <DefaultPage>
        <Title text="Help" description="Tutorials on how to use the player, composer and all the different shortcuts"/>

        <div>
            <div style={{fontSize: '2rem', margin: '1rem 0'}}>
                Info about the app
            </div>
            <div style={{marginLeft: '1rem'}}>
                In this page you will find an explaination for what all the buttons in the app do and
                how to use them.
                <br/><br/>
                If you Have issues, bugs, or suggestions, please join our 
                <a href="https://discord.gg/Arsf65YYHq" style={{color: 'var(--accent)'}}>
                <>&nbsp;</> Discord server
                </a>
                . <br/>
            </div>
            <HelpTab />
        </div>
    </DefaultPage>
}