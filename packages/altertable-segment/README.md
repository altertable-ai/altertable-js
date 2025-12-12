# @altertable/altertable-segment

Segment destination for Altertable. This package lets you forward events from Segment to your Altertable instance.

## Installation

This package is designed to be used within [Segment's Functions environment](https://www.twilio.com/docs/segment/connections/functions/environment). It's not meant to be installed directly in your application.

## Usage

In Segment, create a new Destination Function and copy/paste the content of `dist/index.mjs` file into the editor body.

## Configuration

The destination requires the following settings:

- **apiKey** (required): Your Altertable API key
- **environment** (optional): Altertable environment (defaults to `production`)
- **endpoint** (optional): Custom Altertable API endpoint (defaults to `https://api.altertable.ai`)

## Unsupported Events

The following events throw `EventNotSupported` errors:

- **Group**: Group events are not supported
- **Delete**: Delete events are not supported

## Error Handling

The destination implements automatic retry logic:

- **Network errors**: Throws `RetryError` for connection failures
- **5xx errors**: Throws `RetryError` for server errors
- **429 errors**: Throws `RetryError` for rate limits

Segment will automatically retry these errors based on your function settings.

## Development

```bash
# Build the package
bun run build

# Watch mode for development
bun run dev

# Type check
bun run typecheck
```

## License

MIT
