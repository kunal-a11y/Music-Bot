const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream');
const { StreamType } = require('@discordjs/voice');
const config = require('../../config');
const youtubeService = require('./youtubeService');

const FILTERS = {
  bassboost: 'bass=g=10',
  nightcore: 'asetrate=48000*1.25,aresample=48000,atempo=0.8',
  vaporwave: 'asetrate=48000*0.8,aresample=48000,atempo=1.1',
  '8d': 'apulsator=hz=0.09',
  treble: 'treble=g=8',
  equalizer: 'superequalizer=1b=2:2b=1:3b=1:4b=1:5b=0:6b=0:7b=1:8b=2:9b=2:10b=1'
};

function runFfmpeg(args, inputStream) {
  const ffmpeg = spawn(config.ffmpegPath, args, { windowsHide: true });
  
  if (inputStream) {
    pipeline(inputStream, ffmpeg.stdin, (err) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.code !== 'EPIPE') {
        ffmpeg.stdout.destroy(err);
      }
    });
  }

  let stderr = '';
  ffmpeg.stderr.on('data', (chunk) => { 
    stderr = (stderr + chunk).toString().slice(-1000); 
  });
  
  ffmpeg.on('error', (e) => {
    ffmpeg.stdout.destroy(e);
  });
  
  ffmpeg.on('close', (code) => {
    if (code && !ffmpeg.killed) {
      ffmpeg.stdout.destroy(new Error(`[FFmpeg] Exited with code ${code}: ${stderr || 'No stderr output'}`));
    }
  });

  return ffmpeg;
}

/**
 * Builds a Discord-voice-ready audio resource for a track.
 */
async function buildResource(track, seek = 0, filters = []) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  let inputStream = null;

  if (track.source === 'direct') {
    const url = track.playUrl || track.query || track.url;
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', url);
  } else {
    const target = track.playUrl || track.query || track.url;
    inputStream = await youtubeService.getAudioStream(target);
    args.push('-i', 'pipe:0');
  }

  if (seek > 0) args.push('-ss', String(seek));
  args.push('-vn');
  if (filters.length) args.push('-af', filters.map((f) => FILTERS[f]).filter(Boolean).join(','));
  args.push('-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');

  const ffmpeg = runFfmpeg(args, inputStream);
  
  // Attach a cleanup handler directly to the output stream
  ffmpeg.stdout.on('close', () => {
    if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
  });

  return { stream: ffmpeg.stdout, type: StreamType.Raw };
}

module.exports = { buildResource, FILTERS };
