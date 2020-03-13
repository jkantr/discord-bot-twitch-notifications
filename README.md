# discord-bot-twitch-notifications
A somewhat-almost use-agnostic starting point for getting a discord bot up and running that notifies you of streams going live based on an unnecessarily complex set of filterable attributes.

## Installation
Not currently packaged and/or published to npm. To install, please clone this repo locally and initialize:

```sh
git clone https://github.com/jkantr/discord-bot-twitch-notifications
npm install
```

## Setup
For basic usage, you just need to initialize the local `sqlite` database. This can be done by invoking `npm run migrate:latest`.

Then, copy `config.example.json` to `config.json` and fill in the missing properties (or alter the existing ones).

## Running
To run with somewhat verbose but also readable output:
```
DEBUG=speedbot:* node app.js
```

## Ok but really now, why doesn't it work right?
Ah, I see you are a person of culture.

So the way the application keeps track of a stream being live / going offline is based on webhooks that are registered at the time of the stream going live. This is *regardless* of if it's held by blacklist items or not. If it's caught in the filter, then a webhook is created. Twitch's API calls back on this webhook to notify of changes... and if the changes are triggered, but are "nothing", that means the stream has gone offline (basically).

*If this is not configured properly, your streams will be perpetually online and only ever trigger notifications once* (ie: the application will be fundimentally broken).

To have this properly configured, you need to have a public facing http(s) endpoint that can be accessed (at the very least, by Twitch's API servers). This url is configured in `config.json` under `domain`. This must either resolve to a host/port that this application is bound to OR be reverse proxied (by something like nginx, caddyserver, or similar).