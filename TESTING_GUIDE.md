# Testing Guide

## Quick Start (Windows/Linux/macOS)

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Development Server

Start the backend API server (works on any OS):

```bash
npm run dev:server
```

This starts a local server at `http://localhost:3000` where you can:
- Test onboarding flow
- Send test webhooks
- View pending notifications
- Approve notifications

### 3. Test the Services

Run unit tests:

```bash
npm test
```

Or watch mode:

```bash
npm run test:watch
```

## Testing Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```

### Complete Onboarding
```bash
curl -X POST http://localhost:3000/api/onboarding/complete \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Alice",
    "tag": "alice",
    "roles": ["engineering-frontend", "design"],
    "companyGroupName": "Test Company",
    "isCreatingNewGroup": true
  }'
```

### Send Test Webhook (GitHub example)
```bash
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -d '{
    "action": "opened",
    "pull_request": {
      "id": "123",
      "number": 1,
      "title": "Test PR",
      "user": {"login": "alice"},
      "html_url": "https://github.com/test/repo/pull/1"
    }
  }'
```

### View Pending Notifications
```bash
curl http://localhost:3000/api/notifications/pending
```

### Approve Notification
```bash
curl -X POST http://localhost:3000/api/notifications/{notification-id}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "approvedBy": "user-uuid"
  }'
```

## Testing Without macOS

### Option 1: Backend-Only Testing (Recommended)

The core services work on **any OS**:
- ✅ Change detection
- ✅ Normalization
- ✅ AI interpretation
- ✅ Role-based routing
- ✅ Notification management

**Just run the dev server** - no macOS needed!

### Option 2: macOS Testing (Future)

For testing the **desktop app** later, you can:
1. Use a macOS VM (VMware/VirtualBox)
2. Use GitHub Codespaces with macOS runners
3. Use cloud macOS instances (MacStadium, AWS EC2 Mac)
4. Borrow/find a Mac for final testing

### Option 3: Docker (Future)

We can containerize the backend for consistent testing across platforms.

## Development Workflow

1. **Start dev server**: `npm run dev:server`
2. **Run tests in watch mode**: `npm run test:watch` (in another terminal)
3. **Make API calls** using curl or Postman
4. **Check logs** in the server terminal

## What Works Right Now

- ✅ Core services (onboarding, routing, notifications)
- ✅ Type system and validation
- ✅ API server endpoints
- ✅ Unit tests

## What Needs Implementation

- ⏳ Database persistence (currently in-memory)
- ⏳ Actual webhook processing (GitHub, Notion, etc.)
- ⏳ Desktop app (Tauri) - requires macOS for final testing
- ⏳ LLM integration for AI interpretation
