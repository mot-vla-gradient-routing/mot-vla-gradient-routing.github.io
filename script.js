document.documentElement.classList.add('has-js');

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function setPressed(buttons, active) {
  buttons.forEach(button => {
    const selected = button === active;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

const routeStage = $('#route-stage');
const routeDescriptions = {
  'on-coupled': 'Action-token CE and the expert’s flow loss both update the VLM.',
  'on-insulated': 'Action-token CE updates the VLM; the expert’s gradient stops at the K/V interface.',
  'off-coupled': 'The flow loss is the only direct future-action objective that updates the VLM.',
  'off-insulated': 'Future-action CE is masked, and the expert’s gradient stops at the K/V interface.'
};

function updateRoute() {
  const token = routeStage.dataset.token;
  const route = routeStage.dataset.route;
  $('#routing-explanation').textContent = routeDescriptions[`${token}-${route}`];
  $('#token-branch-label').textContent = token === 'on' ? 'VLM predicts future-action tokens' : 'No supervised future-action prediction';
  $('#token-branch-loss').textContent = token === 'on' ? 'Action-token CE updates VLM ↓' : 'Future-action CE masked';
  $('#token-note').textContent = token === 'on'
    ? 'In driving, the VLM is supervised to predict future-trajectory tokens during training. In manipulation, it predicts a FAST action postfix.'
    : 'In driving, future-action value tokens remain teacher-forced but their CE is masked. In manipulation, the FAST postfix is absent.';
  $('#flow-signal-state').innerHTML = route === 'coupled'
    ? 'Flow loss gradient reaches the VLM'
    : 'Flow loss gradient stops at the K/V interface';
}

$$('[data-token]').filter(button => button.tagName === 'BUTTON').forEach(button => {
  button.addEventListener('click', () => {
    routeStage.dataset.token = button.dataset.token;
    setPressed($$('button[data-token]'), button);
    updateRoute();
  });
});
$$('button[data-route]').forEach(button => {
  button.addEventListener('click', () => {
    routeStage.dataset.route = button.dataset.route;
    setPressed($$('button[data-route]'), button);
    updateRoute();
  });
});

const progressValues = {
  off: { insulated: 42.5, coupled: 60.1, delta: '+17.6 percentage points' },
  on: { insulated: 60.0, coupled: 70.3, delta: '+10.3 percentage points' }
};
$$('button[data-progress-mode]').forEach(button => {
  button.addEventListener('click', () => {
    const data = progressValues[button.dataset.progressMode];
    setPressed($$('button[data-progress-mode]'), button);
    $('#bar-insulated').style.width = `${data.insulated}%`;
    $('#bar-coupled').style.width = `${data.coupled}%`;
    $('#bar-insulated-label').textContent = `${data.insulated.toFixed(1)}%`;
    $('#bar-coupled-label').textContent = `${data.coupled.toFixed(1)}%`;
    $('#progress-delta').textContent = data.delta;
  });
});

const drivingVideos = $$('#driving-grid video');
const drivingPlay = $('#driving-sync-play');
const drivingScrub = $('#driving-sync-scrub');
const drivingTime = $('#driving-sync-time');
const drivingEnd = 19.95;
const drivingMediaVersion = '20261019g';
let drivingPlaying = false;
let drivingFrame = null;
let drivingGeneration = 0;
let lastDrivingSync = 0;

function waitForDrivingVideo(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Video load timed out')), 12000);
    function finish(error) {
      clearTimeout(timeout);
      video.removeEventListener('canplay', ready);
      video.removeEventListener('error', failed);
      error ? reject(error) : resolve();
    }
    function ready() { finish(); }
    function failed() { finish(new Error('Video could not be loaded')); }
    video.addEventListener('canplay', ready, { once: true });
    video.addEventListener('error', failed, { once: true });
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready();
  });
}

function drivingClock() {
  const time = Math.min(drivingVideos[0].currentTime || 0, drivingEnd);
  drivingScrub.value = String(time);
  drivingTime.textContent = `0:${String(Math.floor(time)).padStart(2, '0')} / 0:20`;
  if (drivingPlaying && time >= drivingEnd - 0.04) {
    pauseDriving();
    return;
  }
  if (drivingPlaying) {
    const now = performance.now();
    if (now - lastDrivingSync > 500) {
      drivingVideos.slice(1).forEach(video => {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.seeking) return;
        if (Math.abs(video.currentTime - time) > 0.45) video.currentTime = time;
        if (video.paused && !video.ended) video.play().catch(() => {});
      });
      lastDrivingSync = now;
    }
    drivingFrame = requestAnimationFrame(drivingClock);
  }
}

function pauseDriving() {
  drivingPlaying = false;
  if (drivingFrame !== null) cancelAnimationFrame(drivingFrame);
  drivingVideos.forEach(video => video.pause());
  drivingPlay.disabled = false;
  drivingPlay.innerHTML = '▶ <span>Play all</span>';
  drivingPlay.setAttribute('aria-label', 'Play all four driving videos');
  drivingClock();
}

async function playDriving() {
  pauseMolmo();
  const generation = ++drivingGeneration;
  drivingPlay.disabled = true;
  drivingPlay.innerHTML = '◌ <span>Loading all four…</span>';
  try {
    await Promise.all(drivingVideos.map(waitForDrivingVideo));
    if (generation !== drivingGeneration) return;
  if (drivingVideos[0].currentTime >= drivingEnd - 0.04) {
    drivingVideos.forEach(video => { video.currentTime = 0; });
  }
  drivingVideos.slice(1).forEach(video => { video.currentTime = drivingVideos[0].currentTime; });
  const results = await Promise.allSettled(drivingVideos.map(video => video.play()));
  if (generation !== drivingGeneration) return;
  if (results.some(result => result.status === 'rejected')) {
    pauseDriving();
    drivingPlay.innerHTML = '▶ <span>Retry play all</span>';
    return;
  }
  drivingPlaying = true;
  lastDrivingSync = performance.now();
  drivingPlay.innerHTML = 'Ⅱ <span>Pause all</span>';
  drivingPlay.setAttribute('aria-label', 'Pause all four driving videos');
  drivingClock();
  } catch {
    if (generation === drivingGeneration) {
      pauseDriving();
      drivingPlay.innerHTML = '▶ <span>Retry play all</span>';
    }
  } finally {
    if (generation === drivingGeneration) drivingPlay.disabled = false;
  }
}

drivingPlay.addEventListener('click', () => drivingPlaying ? pauseDriving() : playDriving());
drivingScrub.addEventListener('input', () => {
  const time = Number(drivingScrub.value);
  drivingVideos.forEach(video => { video.currentTime = time; });
  if (!drivingPlaying) drivingClock();
});
$('#driving-sync-restart').addEventListener('click', () => {
  drivingVideos.forEach(video => { video.currentTime = 0; });
  drivingClock();
});
drivingVideos[0].addEventListener('ended', pauseDriving);

$$('button[data-driving-scene]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.classList.contains('is-active')) return;
    drivingGeneration++;
    pauseDriving();
    const scene = button.dataset.drivingScene;
    setPressed($$('button[data-driving-scene]'), button);
    drivingVideos.forEach(video => {
      const arm = video.dataset.drivingArm;
      const src = `assets/videos/driving/${scene}_${arm}.mp4?v=${drivingMediaVersion}`;
      const source = $('source', video);
      if (source.getAttribute('src') !== src) {
        source.src = src;
        video.poster = `assets/videos/driving/${scene}_${arm}.jpg?v=${drivingMediaVersion}`;
        video.load();
      }
    });
    drivingScrub.value = '0';
    drivingTime.textContent = '0:00 / 0:20';
  });
});

function formatTime(seconds) {
  return `0:${String(Math.floor(seconds)).padStart(2, '0')}`;
}

const molmoVideos = $$('#molmo-grid video');
const molmoPlay = $('#molmo-play');
const molmoScrub = $('#molmo-scrub');
const molmoTime = $('#molmo-time');
const molmoEnd = 14.93;
const molmoScenes = {
  pan_clean_ic33: { instruction: 'Use the yellow sponge to scrub the blue handle frying pan.' },
  move_latte_cup_ic33: { instruction: 'Put the latte art cup on top of the cutting board.' },
  tape_into_container_ic13: { instruction: 'Put the tape into the container.' }
};
const molmoProgressEvents = window.molmoProgressEvents;
let molmoPlaying = false;
let molmoFrame = null;
let molmoGeneration = 0;
let lastMolmoSync = 0;

function updateMolmoProgress(previewTime = null) {
  const scene = $('button[data-molmo-scene].is-active').dataset.molmoScene;
  molmoVideos.forEach(video => {
    const frame = Math.min(449, Math.max(0, Math.floor((previewTime ?? video.currentTime) * 30 + .0001)));
    const events = molmoProgressEvents[scene][video.dataset.molmoArm];
    let state = events[0];
    for (const event of events) {
      if (event.frame > frame) break;
      state = event;
    }
    const percent = Math.round(state.progress * 100);
    const score = $('.molmo-score', video.closest('.video-card'));
    if (score.getAttribute('aria-valuenow') === String(percent)) return;
    score.setAttribute('aria-valuenow', String(percent));
    score.setAttribute('aria-valuetext', `${percent} percent`);
    score.dataset.level = state.success ? 'complete' : percent >= 67 ? 'high' : percent >= 33 ? 'partial' : 'zero';
    score.style.setProperty('--score-pct', `${percent}%`);
    $('[data-molmo-progress]', score).textContent = `${percent}%`;
  });
}

function molmoClock() {
  const time = Math.min(molmoVideos[0].currentTime || 0, molmoEnd);
  molmoScrub.value = String(time);
  molmoTime.textContent = `${formatTime(time)} / 0:15`;
  updateMolmoProgress();
  if (molmoPlaying && time >= molmoEnd - .04) {
    pauseMolmo();
    return;
  }
  if (molmoPlaying) {
    const now = performance.now();
    if (now - lastMolmoSync > 500) {
      molmoVideos.slice(1).forEach(video => {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.seeking) return;
        if (Math.abs(video.currentTime - time) > .45) video.currentTime = time;
        if (video.paused && !video.ended) video.play().catch(() => {});
      });
      lastMolmoSync = now;
    }
    molmoFrame = requestAnimationFrame(molmoClock);
  }
}

function pauseMolmo() {
  molmoPlaying = false;
  if (molmoFrame !== null) cancelAnimationFrame(molmoFrame);
  molmoVideos.forEach(video => video.pause());
  molmoPlay.disabled = false;
  molmoPlay.innerHTML = '▶ <span>Play all</span>';
  molmoPlay.setAttribute('aria-label', 'Play all four MolmoAct2 videos');
  molmoClock();
}

async function playMolmo() {
  pauseDriving();
  const generation = ++molmoGeneration;
  molmoPlay.disabled = true;
  molmoPlay.innerHTML = '◌ <span>Loading all four…</span>';
  try {
    await Promise.all(molmoVideos.map(waitForDrivingVideo));
    if (generation !== molmoGeneration) return;
    if (molmoVideos[0].currentTime >= molmoEnd - .04) molmoVideos.forEach(video => { video.currentTime = 0; });
    const time = molmoVideos[0].currentTime;
    molmoVideos.slice(1).forEach(video => { video.currentTime = time; });
    const results = await Promise.allSettled(molmoVideos.map(video => video.play()));
    if (generation !== molmoGeneration) return;
    if (results.some(result => result.status === 'rejected')) {
      pauseMolmo();
      molmoPlay.innerHTML = '▶ <span>Retry play all</span>';
      return;
    }
    molmoPlaying = true;
    lastMolmoSync = performance.now();
    molmoPlay.innerHTML = 'Ⅱ <span>Pause all</span>';
    molmoPlay.setAttribute('aria-label', 'Pause all four MolmoAct2 videos');
    molmoClock();
  } catch {
    if (generation === molmoGeneration) {
      pauseMolmo();
      molmoPlay.innerHTML = '▶ <span>Retry play all</span>';
    }
  } finally {
    if (generation === molmoGeneration) molmoPlay.disabled = false;
  }
}

molmoPlay.addEventListener('click', () => molmoPlaying ? pauseMolmo() : playMolmo());
molmoScrub.addEventListener('input', () => {
  const time = Number(molmoScrub.value);
  molmoVideos.forEach(video => { video.currentTime = time; });
  molmoTime.textContent = `${formatTime(time)} / 0:15`;
  updateMolmoProgress(time);
});
$('#molmo-restart').addEventListener('click', () => {
  molmoVideos.forEach(video => { video.currentTime = 0; });
  molmoClock();
});
molmoVideos[0].addEventListener('ended', pauseMolmo);
molmoVideos.forEach(video => {
  video.addEventListener('seeked', () => updateMolmoProgress());
  video.addEventListener('timeupdate', () => updateMolmoProgress());
});
$$('button[data-molmo-scene]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.classList.contains('is-active')) return;
    molmoGeneration++;
    pauseMolmo();
    const scene = button.dataset.molmoScene;
    const data = molmoScenes[scene];
    setPressed($$('button[data-molmo-scene]'), button);
    $('#molmo-instruction').textContent = data.instruction;
    molmoVideos.forEach(video => {
      const arm = video.dataset.molmoArm;
      const source = $('source', video);
      source.src = `assets/videos/molmoact2/${scene}_${arm}.mp4`;
      video.poster = `assets/videos/molmoact2/${scene}_${arm}.jpg`;
      video.load();
    });
    molmoScrub.value = '0';
    molmoTime.textContent = '0:00 / 0:15';
    updateMolmoProgress(0);
  });
});

const dialog = $('#image-dialog');
$$('button[data-zoom]').forEach(button => {
  button.addEventListener('click', () => {
    $('#dialog-image').src = button.dataset.zoom;
    $('#dialog-image').alt = $('img', button).alt;
    $('#dialog-caption').textContent = button.dataset.caption;
    dialog.showModal();
  });
});
$('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px 50px 0px' });
  $$('.reveal').forEach(element => observer.observe(element));
} else {
  $$('.reveal').forEach(element => element.classList.add('is-visible'));
}
