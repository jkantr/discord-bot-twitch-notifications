declare enum DateStrBrand{}
type DateStr = string & DateStrBrand

declare enum StreamIdBrand{}
type StreamIdStr = string & StreamIdBrand

declare enum UserIdBrand{}
type UserIdStr = string & UserIdBrand

declare enum GameIdBrand{}
type GameIdStr = string & GameIdBrand

declare interface TwitchStream {
    id: StreamIdStr
    user_id: UserIdStr
    user_name: string
    game_id: GameIdStr
    community_ids: Array<string>
    type: "live" | ""
    title: string
    viewer_count: number
    started_at: DateStr
    language: string
    thumbnail_url: string
    tag_ids: Array<string>
}

declare interface ApplicationStream extends TwitchStream {
    isLive: boolean
    lastShoutOut: Date
}

declare interface DatabaseStream extends Omit<ApplicationStream, "id"> {
    internal_id?: number
    stream_id: StreamIdStr
}