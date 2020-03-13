'use strict';

/**
 * @typedef {import('knex')} Knex
 * @typedef {import('knex').TableBuilder} Table
 * @typedef {import('bluebird')} Promise
 */
exports.up = function (/** @type {Knex} */knex, /** @type {Promise} */Promise) {
    /**
     * 
     * @param {Table} table 
     */
    const streamsSchema = (table) => {
        table.increments('internal_id').primary();
        table.integer('stream_id').unique().notNullable();
        table.integer('user_id').unique().notNullable();
        table.text('user_name');
        table.json('community_ids');
        table.integer('viewer_count');
        table.text('type');
        table.text('language');
        table.text('thumbnail_url');
        table.json('tag_ids');
        table.text('game_id');
        table.text('title');
        table.dateTime('started_at');
        table.boolean('isLive');
        table.dateTime('lastShoutOut');
    };

    return knex.schema.createTable('streams', streamsSchema);
};

exports.down = function (knex, Promise) {

};
