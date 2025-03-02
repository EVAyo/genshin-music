/* eslint-disable no-restricted-globals */
/// <reference lib="webworker" />
// This service worker can be customized!
// See https://developers.google.com/web/tools/workbox/modules
// for the list of available Workbox modules, or add any other
// code you'd like.
// You can also remove this file if you'd prefer not to use a
// service worker, and the Workbox build step will be skipped.
import {clientsClaim, setCacheNameDetails} from 'workbox-core';
import {registerRoute} from 'workbox-routing';
import {CacheFirst, NetworkFirst} from 'workbox-strategies';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME as string
const CACHE = `${APP_NAME}-${process.env.NEXT_PUBLIC_SW_VERSION}`
const IS_TAURI = process.env.NEXT_PUBLIC_IS_TAURI === 'true'
const MAJOR_VERSION = 3
const PRECACHE_CACHE = `${MAJOR_VERSION}-precache-${CACHE}`
const RUNTIME_CACHE = `${MAJOR_VERSION}-runtime-${CACHE}`
console.log(`CACHE NAME: "${CACHE}"`)
declare var self: ServiceWorkerGlobalScope
clientsClaim();

//@ts-ignore
const PRECACHE_MANIFEST = self.__WB_MANIFEST as unknown as Array<{ url: string, revision: string }>
const FILTERED_MANIFEST = PRECACHE_MANIFEST.filter(e => !(
    e.url.includes(".mp3") || //runtime cached
    e.url.includes(".md") ||
    e.url.includes(".json") ||
    e.url.includes("media") ||//remove images and other static files as they are runtime cached and take too long to precache
    e.url.includes("manifestData") ||//not needed
    e.url.includes("service-worker") || //not needed
    e.url.includes('.bin')  //not needed
)).map(e => {
    if (e.revision && e.url.includes(e.revision)) {
        //@ts-ignore the revision if already in the url
        e.revision = null
    }
    return e
})
console.log("Precached files:", FILTERED_MANIFEST)

function forbiddenCachedItems(url: URL) {
    if (url.pathname.includes("service-worker")
        || url.pathname.includes("manifestData")
        || url.pathname.endsWith(".json")) return true

}

if (IS_TAURI) {

} else {
    // Precache all of the assets generated by your build process.
    setCacheNameDetails({prefix: "", suffix: "", precache: PRECACHE_CACHE, runtime: RUNTIME_CACHE});
    //precacheAndRoute(FILTERED_MANIFEST);
    console.log("registering routes")
    registerRoute(
        ({url}) => {
            try {
                if (forbiddenCachedItems(new URL(url))) {
                    return false
                }
            } catch (e) {
                console.error("Error caching", e)
            }
            return true
        },
        new NetworkFirst({
            cacheName: RUNTIME_CACHE
        })
    );
    registerRoute(
        ({url}) => {
            try {
                if (forbiddenCachedItems(new URL(url))) {
                    return false
                }
                if (url.pathname.endsWith(".mp3") || url.pathname.endsWith(".wav")) {
                    return true
                }
            } catch (e) {
                console.error("Error caching", e)
            }
            return false
        },
        new CacheFirst({
            cacheName: RUNTIME_CACHE
        })
    )
}

// This allows the web app to trigger skipWaiting via
// registration.waiting.postMessage({type: 'SKIP_WAITING'})
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log("[ServiceWorker] skip waiting")
        self.skipWaiting();
    }
});


//this runs only when the service worker is being loaded for the first time
self.addEventListener('install', async (event) => {
    //If there is a major version, skip waiting and refresh all tabs
    const cacheKeys = await caches.keys()
    if (!cacheKeys.length) return console.log("Fresh install")
    const appKeys = cacheKeys.filter(e => e.includes(APP_NAME))
    if (!appKeys.length) return console.log("Fresh install")
    const majorVersionKeys = appKeys.filter(e => e.startsWith(`${MAJOR_VERSION}`))
    if (majorVersionKeys.length === 0) { //there are existing cache keys but
        console.log("Major version change, skipping waiting and refreshing all tabs")
        await self.skipWaiting()
        await self.clients.claim()
        self.clients.matchAll({type: "window"}).then(clients => {
            clients.forEach(client => {
                client.navigate(client.url)
            })
        })
    }
})

//this runs only when the service worker is updated
self.addEventListener('activate', (evt) => {
    console.log('[ServiceWorker] Activate');
    //Remove previous cached data from cache.
    evt.waitUntil(
        caches.keys().then(async (keyList) => {
            const promises = await Promise.all(keyList.map((key) => {
                if (!APP_NAME) return console.error("APP_NAME is not defined")
                console.log(`Verifying cache "${key}"`)
                if (key.includes(APP_NAME)) {
                    //cache of this app
                    if (key.includes("precache")) {
                        if (key !== PRECACHE_CACHE) {
                            console.log(`[ServiceWorker] Removing old precache: "${key}"`);
                            return caches.delete(key)
                        }
                        return Promise.resolve()
                    }
                    if (key.includes("runtime")) {
                        if (key !== RUNTIME_CACHE) {
                            //handle runtime versions
                            console.log(`[ServiceWorker] Removing old runtime cache: "${key}"`);
                            return caches.delete(key)
                        }
                        return Promise.resolve()
                    }
                    console.log(`[ServiceWorker] Removing old unknown cache: "${key}"`)
                    return caches.delete(key)
                }
                if (key.includes("workbox")) {
                    console.log(`[ServiceWorker] Removing old workbox cache: "${key}"`);
                    return caches.delete(key)
                }
                //@ts-ignore
                return Promise.resolve()
            }));
            console.log(`[ServiceWorker] Finished removing old caches`, promises);
            return promises
        })
    );
    self.clients.claim();
});