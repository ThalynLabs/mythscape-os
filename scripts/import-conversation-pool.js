#!/usr/bin/env node
'use strict';

/**
 * import-conversation-pool.js — Import conversation pool MD files into Brain Skein
 *
 * Groups messages into conversation sessions (2-hour gap = new session)
 * and POSTs each session as a single Skein entry.
 *
 * Usage: node scripts/import-conversation-pool.js [YYYY-MM-DD]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const POOL_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'conversation-pool');
const API_URL = 'http://127.0.0.1:3008/api/skein';
const AUTH_TOKEN = '71e6c347db81bed6a02b56735b8e02722bb09added0ce197bed5d6f66fad3d54';
const RATE_LIMIT_MS = 20;
const SESSION_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseMessages(content, dateStr) {
    const messages = [];
    const lines = content.split('\n');

    let currentSpeaker = null;
    let currentTime = null;
    let currentLines = [];

    function flush() {
        if (currentSpeaker && currentLines.length > 0) {
            const body = currentLines
                .map(l => l.replace(/^>\s?/, ''))
                .join('\n')
                .trim();

            if (body && body !== 'NO_REPLY' && body !== 'HEARTBEAT_OK') {
                messages.push({
                    speaker: currentSpeaker,
                    time: currentTime,
                    content: body,
                });
            }
        }
        currentLines = [];
    }

    for (const line of lines) {
        // Channel header — skip
        if (/^## .+ — channel:\S+/.test(line)) {
            flush();
            continue;
        }

        // Message header: [HH:MM] **Speaker**
        const headerMatch = line.match(/^\[(\d{2}:\d{2})\]\s+\*\*(.+?)\*\*/);
        if (headerMatch) {
            flush();
            currentTime = headerMatch[1];
            currentSpeaker = headerMatch[2];
            continue;
        }

        // Quoted content line
        if (line.startsWith('>')) {
            currentLines.push(line);
        }
    }
    flush();

    // Build Date objects from date + time (MST approximate)
    return messages.map(m => {
        const iso = `${dateStr}T${m.time}:00-07:00`;
        return {
            speaker: m.speaker,
            content: m.content,
            time: m.time,
            timestamp: new Date(iso),
            isoString: iso,
        };
    });
}

// ── Session grouping ─────────────────────────────────────────────────────────

function groupIntoSessions(messages) {
    if (messages.length === 0) return [];

    const sessions = [];
    let current = [messages[0]];

    for (let i = 1; i < messages.length; i++) {
        const gap = messages[i].timestamp - messages[i - 1].timestamp;
        if (gap >= SESSION_GAP_MS) {
            sessions.push(current);
            current = [messages[i]];
        } else {
            current.push(messages[i]);
        }
    }
    sessions.push(current);

    return sessions;
}

function buildSessionEntry(session, dateStr) {
    const participants = [...new Set(session.map(m => m.speaker))];

    const contentLines = session.map(m => `[${m.time}] ${m.speaker}: ${m.content}`);
    const content = contentLines.join('\n');

    const d = session[0].timestamp;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateLabel = `${monthNames[d.getMonth()]} ${d.getDate()}`;
    const firstMsg = session[0].content.slice(0, 80);
    const summary = `Conversation on ${dateLabel} (${session.length} messages) — ${firstMsg}`;

    return {
        surface: 'discord',
        type: 'message',
        participants,
        tags: ['imported', 'discord', 'conversation-pool'],
        timestamp: session[0].isoString,
        content,
        summary,
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── API ──────────────────────────────────────────────────────────────────────

async function postEntry(entry) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
        body: JSON.stringify(entry),
    });

    if (res.ok) return 'ok';
    if (res.status === 409) return 'duplicate';
    const text = await res.text().catch(() => '');
    return `error:${res.status}:${text.slice(0, 100)}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    if (!fs.existsSync(POOL_DIR)) {
        console.error(`Pool directory not found: ${POOL_DIR}`);
        process.exit(1);
    }

    const START_FROM = process.argv[2] || null;
    const files = fs.readdirSync(POOL_DIR)
        .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .filter(f => !START_FROM || f >= `${START_FROM}.md`)
        .sort();

    if (files.length === 0) {
        console.log('No conversation pool files found.');
        return;
    }

    console.log(`Found ${files.length} conversation pool file(s)\n`);

    let totalImported = 0;
    let totalSessions = 0;
    let totalMessages = 0;

    for (const file of files) {
        const dateStr = file.replace('.md', '');
        const content = fs.readFileSync(path.join(POOL_DIR, file), 'utf-8');
        const messages = parseMessages(content, dateStr);
        const sessions = groupIntoSessions(messages);

        totalMessages += messages.length;
        totalSessions += sessions.length;

        let imported = 0;
        for (const session of sessions) {
            const entry = buildSessionEntry(session, dateStr);
            const result = await postEntry(entry);
            if (result === 'ok') {
                imported++;
            } else if (result !== 'duplicate') {
                console.error(`  Error: ${result}`);
            }
            await sleep(RATE_LIMIT_MS);
        }

        totalImported += imported;
        console.log(`Importing ${file}: ${messages.length} messages → ${sessions.length} sessions, ${imported} imported`);
    }

    console.log(`\n── Summary ──`);
    console.log(`Files: ${files.length}  Messages: ${totalMessages}  Sessions: ${totalSessions}  Imported: ${totalImported}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
