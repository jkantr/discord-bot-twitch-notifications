///<reference path="./twitch.js" />
const debug = require('debug')('speedbot:app');
const Promise = require('bluebird');
const express = require('express');
const bodyParser = require('body-parser');
const twitchClient = require('./twitch');
const config = require('./config.json');
const Stream = require('./models/Stream');

const app = express();

app.use('/streamUpdate/:userId', bodyParser.json(), async (req, res) => {
    debug('webhook received', req.params.userId)
    const userId = req.params.userId;

    if (req.query['hub.challenge']) {
        debug(`verification request received on webhook for user ${userId} with challenge ${req.query['hub.challenge']}`);
        return res.send(req.query['hub.challenge']);
    }

    if (Array.isArray(req.body.data) && !req.body.data.length) {
        debug(`end of stream webhook came in for user id ${userId}, unsubscribing...`);
        await Stream.setEnded(userId);
        return twitchClient.unsubscribeFromUserStream(userId).then(() => res.sendStatus(200));
    } else {
        debug(`non-empty webhook came in for user id ${userId}, leaving alone`);
    }

    return res.sendStatus(200);
});

/**
 * 
 * @param {Array<TwitchStream>} streams 
 */
function validateStreams(streams) {
    return Promise.map(streams, async (stream) => {
        const existingStream = await Stream.getOne(stream.user_id);

        if (existingStream && existingStream.isLive) {
            return Stream.update(existingStream, stream);
        } else if (existingStream) {
            return Stream.goneLive(existingStream, stream);
        } else {
            return Stream.addNew(stream);
        }
    })
}

async function checkStreams() {
    return Promise.try(() => {
        debug('verifying current webhook subs..');
        return twitchClient.getAllWebhooks()
    }).then((subs) => {
        // debug('getting twitch streams by metadata')
        return twitchClient.getStreamsByMetadata(config.twitch.whitelist.gameIds, {
            tagIds: config.twitch.whitelist.tagIds,
            keywords: config.twitch.whitelist.keywords
        });
    }) .then((streams) => {
        if (!streams.length) {
            debug('no active streams found with your search configuration');
            return;
        }

        debug(`${streams.length} active stream(s) found with your search configuration, validating for actions....`);
        return validateStreams(streams);
    }).catch({ code: 'ECONNREFUSED' }, (err) => {
        // being rate limited by twitch... let's let it calm down a bit extra...
        debug('Twitch refused API request (likly due to rate limit) - waiting an additional 30 seconds');
        return Promise.delay(30000);
    }).finally(() => {
        // debug('polling cycle done, waiting 30s ...')
        return Promise.delay(30000).then(() => checkStreams());
    });
}

app.listen(5001, () => {
    checkStreams();
});
