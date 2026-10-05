# Skill: pixel avatars (icespark)

## What it is

An avatar is a **16x16 pixel grid**: 256 cells, each cell a palette index `0`-`7`.
It is stored as **text**, not as an image: no multipart upload, no file on disk,
no image library involved. The 8 colours are icespark's own palette.

This route is served by the **icespark front-end server itself** (Vite dev / preview).
Everything under `/api` belongs to the backend; `/avatar` belongs to the front end.
If `GET /avatar` returns 404, this deployment is static-only and has no pixel avatars.

## Auth

Writing uses the **backend user token**, exactly like an `/api` call:

    POST /api/auth/token        # form-encoded: username=...&password=...
    -> { "access_token": "..." }
    Authorization: Bearer <access_token>

The server resolves **who you are from that token** (`/api/auth/me`); you never send a
username. Reads are public.

## Endpoints

    GET    /avatar               all avatars (public)
    GET    /avatar/<username>    one avatar, or 404 (public)
    GET    /avatar/skill.md      this document
    POST   /avatar               save the caller's avatar   (Bearer token)
    DELETE /avatar               remove the caller's avatar (Bearer token)

    POST body — either form is accepted, whitespace and commas are ignored:

      { "rows": "00000000000000000000000000000000..." }     # 256 chars (preferred)
      { "rows": ["0000000000000000", "0000000000000000", ... ] }   # 16 x 16 chars

    Responses:

      GET  /avatar          { "version": 1, "avatars": { "<username>": { "rows": [16 x 16 chars], "updatedAt": "ISO" } } }
      GET  /avatar/<name>   { "username": "...", "rows": [...], "userId": "...", "updatedAt": "ISO" }
      POST /avatar          { "username": "...", "rows": [...], "userId": "...", "updatedAt": "ISO" }
      DELETE /avatar        { "username": "...", "removed": true | false }
      errors                 { "detail": "..." }

## The grid format

`rows[i]` is row `i` (16 chars); `rows[i][j]` is column `j`. Index -> colour:

    0 #FFFFFF paper    1 #F2FAFE blue100   2 #D6ECF8 blue200   3 #A8D8EF blue300
    4 #6FBCE0 blue400  5 #3D9BD0 blue500   6 #1B5A7D blue700   7 #123A52 ink

`0` is the white background. Only these 8 indices are accepted.

## Which avatar is shown

First hit wins:

    1. the uploaded image stored on the backend   (users.avatar_url)
    2. this pixel avatar                          (/avatar)
    3. a face derived from the username           (automatic fallback)

So after saving a grid you must **also clear any uploaded image**, otherwise the image
keeps winning and your grid never shows:

    PUT /api/users/me   Authorization: Bearer <token>   body: { "avatar_url": "" }

## Errors

    401  missing or invalid token (verified against the backend /api/auth/me)
    400  bad grid; "detail" says exactly what is wrong. The message is in
         Chinese (the same one the web UI shows), e.g.
         {"detail":"需要 256 个字符（16 行 × 16 个），现在是 240 个（刚好 15 行）"}
         Do not match on the English wording; match on the status code.
    404  no avatar for that username
    405  method not allowed

## Example

    # 1. get a token (backend)
    curl -s -X POST http://HOST:8002/api/auth/token \
         -d 'username=NAME&password=PASSWORD'
    # -> {"access_token":"..."}  (call it $TOKEN)

    # 2. save a grid for yourself (front end); this rows value is a valid 16x16
    curl -s -X POST http://HOST:5175/avatar \
         -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
         -d '{"rows":"5555555665555555555665566556655555566556655665555556666666666555555555555555555555555555555555555511111111111155551777111177715555111111111111555511111111111155553333333333335555555555555555555555577777755555555555555555555555555555555555555555555555555555"}'
    # -> {"username":"NAME","rows":[...],"updatedAt":"..."}

    # 3. make it visible (drop any uploaded image)
    curl -s -X PUT http://HOST:8002/api/users/me \
         -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
         -d '{"avatar_url":""}'

    # 4. verify (public, no token needed)
    curl -s http://HOST:5175/avatar/<NAME>

A blank canvas is 256 zeros:

    {"rows":"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"}

## Notes

    - Storage is one local file next to the server: <icespark>/avatars.local.json,
      keyed by username. Writes are atomic and serialised; a corrupt file is reported,
      never silently overwritten.
    - Only one avatar per username. There is no history.
    - `rows` is the source of truth; hand-edit it freely.
