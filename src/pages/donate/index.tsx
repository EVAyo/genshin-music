import paypalImg from '$/assets/images/paypalme.png'
import buyMeACoffeeImg from '$/assets/images/buymeacoffee.svg'
import kofiImg from '$/assets/images/kofi.png'
import { Title } from '$cmp/Miscellaneous/Title'
import { DefaultPage } from '$cmp/Layout/DefaultPage'
import Image from 'next/image'
export default function Donate() {
    return <DefaultPage>
        <Title text="Donate" description='Please donate to help the development of sky music nightly, genshin music nightly and all the other apps i make.'/>
        <div className="donate-text">
            Each App I make takes months of learning and development. Added to that
            are also the costs of hosting. With a higher budget I can afford to not
            worry so much about how much I spend on the server, giving you the best
            possible experience.<br />
            I care about giving users all features without
            having to pay for it, neither having intrusive ads which can be annoying.
            For this same reason, there is no source of income except donations.
            <br /><br />
            I would be really thankful if you could consider donating in order to fund
            development and costs.
        </div>
        <div className="donation-wrapper">
            <a href="https://paypal.me/specyDev" target="_blank" className="paypal" rel="noreferrer">
                <Image 
                    src={paypalImg}
                    alt='paypalme'
                    loading='lazy'
                    style={{ height: "3rem", width: "auto" }}
                />
            </a>
            <a href="https://ko-fi.com/specy" target="_blank" className="kofi" rel="noreferrer">
                <Image 
                    src={kofiImg}
                    alt='kofi'
                    loading='lazy'
                    style={{ height: "2rem", width: "auto"}}
                />
            </a>
            <a href="https://www.buymeacoffee.com/specy" target="_blank" rel="noreferrer">
                <Image 
                    src={buyMeACoffeeImg}
                    alt='buymeacoffee'
                    loading='lazy'
                    style={{ height: "3rem" }}
                />
            </a>
        </div>
    </DefaultPage>
}