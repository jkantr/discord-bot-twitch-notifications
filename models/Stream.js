const debug = require('debug')('speedbot:stream');
const Promise = require('bluebird');
const { differenceInHours } = require('date-fns');
const config = require('../config.json');
const db = require('../connection');
const twitchClient = require('../twitch');
const discordBot = require('../discord');

/**
 * @returns {import('knex').QueryBuilder<DatabaseStream>}
 */
function dbTable() {
    return db('streams');
}

function subscribeToStream(stream) {
    debug(`subscribing to webhook for user ${stream.user_id} ${stream.user_name}...`);
    twitchClient.subscribeToUserStream(stream.user_id);
}

/**
 * @param {ApplicationStream | DatabaseStream} stream 
 */
function alertStream(stream) {
    return Promise.try(() => {
        if (stream.title && config.twitch.blacklist.keywords.some(kw => stream.title.toLowerCase().includes(kw.toLocaleLowerCase()))) {
            debug(`blacklisted keyword found, suppressing alert for user ${stream.user_id} ${stream.user_name}`);
            throw new Error('stream contains blacklisted keyword');
        }
        return discordBot.newStreamAlert(stream);
    });
}

/**
 * 
 * @param {ApplicationStream | TwitchStream} istream 
 * @returns {DatabaseStream} a stream object that can be digested into a database
 */
function convertToDStream(istream) {
    const { id, ...dStream } = istream;
    const databaseStream = {
        ...dStream,
        // @ts-ignore
        isLive: istream.isLive != null ? istream.isLive : null,
        // @ts-ignore
        lastShoutOut: istream.lastShoutOut != null ? istream.lastShoutOut : null,
        stream_id: id,
    }
    return databaseStream;
}

module.exports = {
    getAll() {
        return dbTable();
    },
    getLive() {
        return dbTable().where('isLive', true);
    },
    setLive(userId) {
        return dbTable().update('isLive', true).where('user_id', userId);
    },
    setEnded(userId) {
        return dbTable().update('isLive', false).where('user_id', userId);
    },
    /**
     * @returns {Promise<DatabaseStream>} 
     */
    getOne(userId) {
        return dbTable().where('user_id', userId).first();
    },
    /**
     * 
     * @param {ApplicationStream | TwitchStream} stream 
     * @returns {Promise<ApplicationStream>}
     */
    async create(stream) {
        debug(`creating new record for ${stream.user_id} ${stream.user_name} in db...`)
        return dbTable().insert(convertToDStream(stream));
    },
        /**
     * 
     * @param {DatabaseStream} stream 
     * @param {TwitchStream} [update]
     * @returns {Promise<ApplicationStream>}
     */
    async update(stream, update) {
        let updatedStream;
        debug(`stream of user ${stream.user_id} ${stream.user_name} being updated`);

        if (update) {
            updatedStream = { ...stream, ...convertToDStream(update) };
        } else {
            updatedStream = stream;
        }

        return dbTable().update(stream).where('user_id', updatedStream.user_id).returning('*');
    },
    /**
     * @param {ApplicationStream | TwitchStream | DatabaseStream} stream 
     */
    isWhitelisted(stream) {
        return config.twitch.whitelist.userIds.includes(stream.user_id);
    },
    /**
     * @param {ApplicationStream} stream 
     */
    isBlacklisted(stream) {
        return config.twitch.blacklist.userIds.includes(stream.user_id);
    },
    /**
     * @param {DatabaseStream} stream 
     * @param {TwitchStream} update 
     */
    async goneLive(stream, update) {
        debug(`Existing stream, seen newly live: user ${stream.user_id} ${stream.user_name}`);
        const updatedStream = { ...stream, ...(convertToDStream(update)), isLive: true, lastShoutOut: stream.lastShoutOut };
        const lastShoutOutAge = Math.abs(differenceInHours(updatedStream.lastShoutOut, new Date()));
        
        if (lastShoutOutAge >= 90 || Number.isNaN(lastShoutOutAge) || this.isWhitelisted(updatedStream)) {
            debug(`Last s/o was ${lastShoutOutAge} hours ago, which is over threshold (or user is whitelisted) - shouting out stream for user ${stream.user_id} ${stream.user_name}`);
            try {
                await alertStream(updatedStream);
                updatedStream.lastShoutOut = new Date();
            } catch (e) {
                debug(`unable to trigger alert for ${stream.user_id} ${stream.user_name}`)
            }
        } else {
            debug(`Stream was already s/o ${lastShoutOutAge} hours ago - suppressing shoutout for user ${stream.user_id} ${stream.user_name}`);
        }

        subscribeToStream(updatedStream);
        return this.update(updatedStream)
    },
    /**
     * @param {TwitchStream} stream 
     */
    async addNew(stream) {
        debug(`stream for user ${stream.user_id} ${stream.user_name} has never been parsed before! storing internal reference...`);
        debug(`shouting out stream for new user ${stream.user_id} ${stream.user_name}`);
            const newStream = { ...stream, isLive: true, lastShoutOut: null };
            try {
                await alertStream(newStream);
                newStream.lastShoutOut = new Date();
            } catch (e) {
                debug(`unable to trigger alert for ${stream.user_id} ${stream.user_name}`)
            } finally {
                subscribeToStream(newStream);
            }
            return this.create(newStream);
    }
}