# Workpad group-chat attachments

**Status:** shipped 2026-11-16.

## UI

`/desktop/workpad/<project>` → 群聊：

- `＋` file picker: text `.md/.txt/.json/.csv/.log/.ts/.tsx/.js/.jsx/.py/.html/.css/.yaml/.yml/.xml/.toml/.sh` + `image/*`.
- Drag & drop files anywhere on the chat card.
- Up to 4 attachments; text 2MB; image 8MB.
- Image thumbnails and filename/size chips; remove per chip.
- Sending with only images uses `请查看附件图片。`.

## API

`postChat(..., attachments)` sends:

```ts
{ name, kind: 'text' | 'image', mime_type, data, size }
```

`/api/chat` enforces max 4, text 60k chars, image data-URL png/jpeg/webp/gif
and 8MB. Text attachments are appended to the model prompt; images are sent as
AI SDK image parts.

## Verified

- Text attachment `note.txt` containing "project codename: bluebird" → model replied `bluebird`.
- Image attachment (1x1 PNG) with `nvidia/nemotron-3.5-super-vl:free` → model replied `红`.
- Non-vision models reject images with the provider's real error; no silent fallback.
- Active model restored to `deepseek-chat` after testing.

## Limits

- Image understanding requires a vision-capable model; default DeepSeek chat is
  text-only.
- History persists attachment names/text content, not the image bytes; reopening
  history does not re-render the original image.
