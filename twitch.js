const debug = require('debug')('speedbot:twitch');
const Promise = require('bluebird');
const qs = require('querystring');
const fetch = require('node-fetch');

const config = require('./config.json');
const twitchConfig = config.twitch;

const URL_BASE = 'https://api.twitch.tv/helix';

let token;

function apiRequest({ endpoint, payload = {}, method = "GET", urlBase = URL_BASE, responseType = 'json', headers = {} }) {
    const compiledHeaders = { "Client-ID": twitchConfig.credentials.clientId, 'Content-Type': 'application/json', ...headers };
    const params = method.toUpperCase() == 'GET' ? `?${qs.stringify(payload)}` : '';

    // debug(`making api request to: ${urlBase}${endpoint}${params}`)
    return fetch(`${urlBase}${endpoint}${params}`, {
        method,
        headers: compiledHeaders,
        body: method.toUpperCase() === 'POST' ? JSON.stringify(payload) : undefined,
    })
    .then((res) => {
        if (responseType === 'json') {
            return res.json();
        } else {
            return res.text();
        }
    });
}

/**
 * @returns {Promise<string>}
 */
function ensureToken() {
    return Promise.try(() => {
        // @TODO: implement token expiration handling
        if (token) return token;

        debug('no oauth token! getting a new one...');
        return apiRequest({
            endpoint: '/oauth2/token',
            payload: {
                client_id: twitchConfig.credentials.clientId,
                client_secret: twitchConfig.credentials.clientSecret,
                grant_type: 'client_credentials',
            },
            method: 'post',
            urlBase: 'https://id.twitch.tv',
        }).then(({ access_token }) => {
            token = access_token;
            debug('successfully updated token');
            return token;
        });
    });
}

/**
 * 
 * @param {string} cursor
 * @param {Array<string>} tags
 */
function getAllTags(cursor, tags = []) {
    const endpoint = '/tags/streams';

    return apiRequest({ endpoint, payload: { first: 100, after: cursor } })
        .then(({ data, pagination }) => {
            if (!data) return tags;

            const newTags = tags.concat(
                data.map(tag => ({ id: tag.tag_id, name: tag.localization_names['en-us'] }))
            );

            if (pagination.cursor) {
                return getAllTags(pagination.cursor, newTags);
            } else {
                return newTags;
            }
        });
}

function getGameId(name) {
    const endpoint = '/games';

    return apiRequest({ endpoint, payload: { name } });
}

/**
 * @param {Array<string> | string} games
 * @param {String} [cursor]
 * @returns {Promise<Array<TwitchStream>>}
 */
function getStreams(games = [], cursor, streams = []) {
    const endpoint = '/streams';

    const gameIds = Array.isArray(games) ? games.join(',') : games;
    return apiRequest({ endpoint, payload: { first: 100, game_id: gameIds, after: cursor } })
        .then(({ data, pagination }) => {
            // debug('data', data.length)
            if (!data) return streams;

            const newStreams = streams.concat(data);
            // debug('pagination', pagination)
            if (pagination.cursor && data.length >= 100) {
                return getStreams(games, pagination.cursor, newStreams);
            } else {
                return newStreams;
            }
        });
}

/**
 * 
 * @param {Array<string>} gameIds 
 * @param {Array<string>} tagIds
 * @returns {Promise<TwitchStream[]>}
 */
function getStreamsByTagId(gameIds, tagIds) {
    return getStreams(gameIds)
        .then(streams => streams.filter(stream => stream.tag_ids && stream.tag_ids.some(id => tagIds.includes(id))));
}

/**
 * 
 * @param {Array<string>} gameIds 
 * @param {Array<string>} keywords
 * @returns {Promise<TwitchStream[]>}
 */
function getStreamsByKeywords(gameIds, keywords) {
    return getStreams(gameIds)
        .then(streams => streams.filter(stream => stream.title && keywords.some(kw => stream.title.toLowerCase().includes(kw.toLocaleLowerCase()))));
}

/**
 * Exported alias for getStreamsByTagId
 * @param {Array<string>} gameIds
 * @param {{ tagIds: Array<string>, keywords: Array<string> }} options
 * @returns {Promise<Array<TwitchStream>>}
 */
function getStreamsByMetadata(gameIds, { tagIds, keywords }) {
    return Promise.all([
        getStreamsByTagId(gameIds, tagIds),
        getStreamsByKeywords(gameIds, keywords),
    ]).then(([ taggedStreams, kwStreams ]) => {
        // debug('received tagged and kw streams, fitlering...')
        // dedupe streams that are in both groups, while merging them
        return [...taggedStreams, ...kwStreams].reduce((streams, stream) => {
            if (streams.find(s => s.id === stream.id)) {
                return streams;
            } else {
                return streams.concat(stream);
            }
        }, []);
    });
}

function streamWebhookRequest(userId, mode) {
    const endpoint = '/webhooks/hub';

    return apiRequest({
        endpoint,
        payload: {
            'hub.callback': `${config.domain}/streamUpdate/${userId}`,
            'hub.mode': mode,
            'hub.topic': `${URL_BASE}/streams?user_id=${userId}`,
            'hub.lease_seconds': 86400
        },
        method: 'post',
        responseType: 'text',
    }).then(console.log);
}

function subscribeToUserStream(userId) {
    return streamWebhookRequest(userId, 'subscribe')
}

function unsubscribeFromUserStream(userId) {
    return streamWebhookRequest(userId, 'unsubscribe')
}

function getAllWebhooks() {
    const endpoint = '/webhooks/subscriptions';

    return Promise.try(() => {
        return ensureToken();
    }).then(() => {
        return apiRequest({ endpoint, headers: { Authorization: 'Bearer ' + token } });
    }).tap(subs => debug('subs: ', subs));
}

function getUserId(username) {
    const endpoint = '/users';
    return apiRequest({ endpoint, payload: { login: username } });
}

module.exports = { getGameId, getUserId, getStreamsByMetadata, getAllWebhooks, subscribeToUserStream, unsubscribeFromUserStream };
