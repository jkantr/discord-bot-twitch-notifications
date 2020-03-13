const debug = require('debug')('speedbot:discord');
const Promise = require('bluebird');
const discordConfig = require('./config.json').discord;

const Discord = require('discord.js');
const client = new Discord.Client();

client.on('ready', () => {
    debug(`Logged in as ${client.user.tag}`);
});

client.login(discordConfig.credentials.botToken);

let failedLogins = 0;

function reattemptLogin(err) {
    failedLogins += 1;

    if (failedLogins > 50) {
        debug('Too many failed logins or disconnections, shutting down', err);
        throw err;
    }

    client.once('error', (err) => {
        debug('Unexpected discord sourced error:', err);
        client.login(discordConfig.credentials.botToken);
        client.once('error', reattemptLogin);
    });
}

client.once('error', reattemptLogin);

/**
 * @param {Discord.Collection<string, Discord.Channel>} channels
 * @returns {Array<Discord.TextChannel>}
 */
function getAllTextChannels(channels) {
    return Array.from(channels.values()).filter(
        /** @returns {channel is Discord.TextChannel} */
        channel => channel.type === 'text'
    ).filter(channel => channel.name === 'general');
}

function newStreamAlert(data) {
    let welcomeMessage;

    if (data.user_id === '72692222') {
        welcomeMessage = '@here We are Live!';
    } else {
        welcomeMessage = `${data.user_name} is live!`;
    }

    /* 
     * the zero width space unicode character is necessary to start the payload on the second line
     * because discord otherwise eats any sort of line break at the start of a message
     */
    const payload =`\u200B
${welcomeMessage} - "${data.title}"
https://www.twitch.tv/${data.user_name}`;

    // allows for filtering to a specific configured discord guild, that can be used to "test" when NODE_ENV=test
    if (process.env.NODE_ENV === 'test') {
        const [testChannel] = getAllTextChannels(client.channels).filter(channel => channel.guild.name === discordConfig.testGuildName);
        return testChannel.send(payload);
    }

    return Promise.map(getAllTextChannels(client.channels), (channel) => {
        debug(payload);
        return channel.send(payload);
    });
}

module.exports = { newStreamAlert };
