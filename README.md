# Ghost.txt - Private Encrypted Chat Rooms

A secure, ephemeral chat application with end-to-end encryption, real-time messaging, and admin controls. No message history is stored - conversations exist only in memory and disappear when users leave.

## Features

### Privacy & Security
- **End-to-End Encryption**: Messages are encrypted client-side using TweetNaCl.js before being sent. The server never sees plaintext messages.
- **No Message Storage**: All messages exist only in memory - nothing is saved to any database.
- **Encryption Key in URL Hash**: The encryption key is stored in the URL fragment (`#key`), which is never sent to the server.
- **5-Minute Room Cooldown**: After all users leave, room IDs are locked for 5 minutes to prevent confusion.

### Real-Time Features
- **Instant Messaging**: Powered by Pusher presence channels for real-time communication.
- **Typing Indicators**: See when others are typing with WhatsApp-style animated dots.
- **Online User List**: See who's currently in the room with live status updates.

### Admin Controls
- **Waiting Room**: Users must request to join, and the room creator (admin) approves or rejects requests.
- **Kick Users**: Admins can remove any user from the room at any time.
- **Admin Badge**: The room creator is marked with a crown icon.

### User Experience
- **4-Digit Room Codes**: Easy-to-share room identifiers.
- **Session-Based Nicknames**: Names persist only for your browser session.
- **Dark/Light Theme**: Toggle between themes or use system preference.
- **Fully Responsive**: Works on all devices - mobile, tablet, and desktop.
- **Smooth Animations**: Hover effects, click animations, and transitions throughout.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4 with CSS variables for theming
- **UI Components**: shadcn/ui
- **Real-Time**: Pusher Channels
- **Encryption**: TweetNaCl.js
- **Theme**: next-themes

## Environment Variables

Create a `.env.local` file with the following variables:

```env
PUSHER_APP_ID=your_app_id
PUSHER_SECRET=your_secret
NEXT_PUBLIC_PUSHER_KEY=your_key
NEXT_PUBLIC_PUSHER_CLUSTER=your_cluster
```

Get these credentials by creating a free account at [pusher.com](https://pusher.com).

## Getting Started

1. **Install pnpm** (if not already installed):
   ```bash
   npm install -g pnpm
   ```
   Or via the standalone installer:
   ```bash
   # Windows (PowerShell)
   iwr https://get.pnpm.io/install.ps1 -useb | iex

   # macOS/Linux
   curl -fsSL https://get.pnpm.io/install.sh | sh -
   ```
   Verify installation:
   ```bash
   pnpm --version
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Set up environment variables** (see above)

4. **Run the development server**:
   ```bash
   pnpm dev
   ```

5. **Open** [http://localhost:2000](http://localhost:2000)

## How It Works

### Creating a Room
1. Enter your nickname
2. Optionally specify a 4-digit room ID (or let one be generated)
3. Click "Create Room"
4. Share the full URL (includes encryption key) with others

### Joining a Room
1. Enter your nickname
2. Enter the 4-digit room ID
3. If you have the full URL with encryption key, paste it directly
4. Wait for the admin to approve your join request
5. If joining without the URL, you'll need to enter the encryption key manually

### Admin Controls
- The room creator automatically becomes the admin
- Approve or reject join requests from the admin panel
- Click the X button next to any user to kick them
- Kicked users are redirected to the home page

## Security Notes

- The encryption key is derived from the URL hash fragment, which browsers never send to servers
- Messages are encrypted/decrypted entirely in the browser
- The server only sees encrypted ciphertext
- No messages, user data, or room history is persisted
- Room data exists only in server memory and is cleaned up when empty

## Browser Support

- Chrome/Chromium (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome for Android)

## Privacy Policy

**Effective Date:** January 1, 2026

### Data We Collect
We collect no personal data. Ghost.txt does not require registration, email, or any identifying information.

### What Happens in the App
- **Nicknames** are stored only in your browser session and are never saved server-side.
- **Messages** exist solely in server memory for the duration of a session and are permanently deleted when all users leave the room.
- **Encryption keys** live exclusively in the URL hash fragment (`#key`) and are never transmitted to the server.
- **No logs, databases, or analytics** are used to store or track user activity or message content.

### Third-Party Services
- **Pusher** is used for real-time communication. Pusher may process transient connection metadata (e.g., IP address) per their own [Privacy Policy](https://pusher.com/legal/privacy-policy/). The server only forwards encrypted ciphertext — Pusher never receives plaintext messages.

### Cookies & Tracking
No cookies, trackers, or fingerprinting techniques are used.

### Children's Privacy
This application is not directed at children under 13. No data is knowingly collected from minors.

### Changes to This Policy
Any updates to this policy will be reflected in this document with a revised effective date.

### Contact
For privacy-related questions, open an issue in the project repository.

---

## License

MIT

## Copyright

Copyright © 2026 Swagnik. All rights reserved.

This project is licensed under the MIT License — you are free to use, modify, and distribute this software, provided the original copyright notice and license terms are retained.
