// Import Rocksmith Packs — upload or point at .psarc files and watch them convert.
(function () {
    'use strict';

    const API = '/api/plugins/pack_import';
    const SCREEN = 'plugin-pack_import';
    let els = null;
    let pollTimer = null;
    let jobId = null;

    function $(id) { return document.getElementById(id); }

    function bind() {
        if (els && els.drop.isConnected) return els;
        const drop = $('pi-drop');
        if (!drop) return null;
        els = {
            drop,
            files: $('pi-files'),
            path: $('pi-path'),
            pathGo: $('pi-path-go'),
            unavailable: $('pi-unavailable'),
            job: $('pi-job'),
            jobTitle: $('pi-job-title'),
            jobState: $('pi-job-state'),
            log: $('pi-log'),
        };
        drop.addEventListener('click', () => els.files.click());
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('border-blue-500'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('border-blue-500'));
        drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('border-blue-500');
            upload(e.dataTransfer && e.dataTransfer.files);
        });
        els.files.addEventListener('change', () => { upload(els.files.files); els.files.value = ''; });
        els.pathGo.addEventListener('click', convertPath);
        els.path.addEventListener('keydown', (e) => { if (e.key === 'Enter') convertPath(); });
        return els;
    }

    async function errorText(resp) {
        try {
            const body = await resp.json();
            return body.detail || body.error || resp.statusText;
        } catch (_) {
            return resp.statusText || `HTTP ${resp.status}`;
        }
    }

    function showJob(job) {
        if (!els || !job) return;
        jobId = job.id;
        els.job.classList.remove('hidden');
        els.jobTitle.textContent = job.label;
        const states = {
            queued: 'Waiting for the previous import…',
            running: 'Converting…',
            done: `Done: ${job.converted} converted, ${job.failed} failed`,
            failed: 'Stopped with an error',
        };
        els.jobState.textContent = states[job.state] || job.state;
        els.log.textContent = (job.lines || []).join('\n');
        els.log.scrollTop = els.log.scrollHeight;
        const busy = job.state === 'queued' || job.state === 'running';
        if (busy && !pollTimer) pollTimer = setInterval(poll, 1000);
        if (!busy) stopPolling();
    }

    function showError(msg) {
        if (!els) return;
        els.job.classList.remove('hidden');
        els.jobTitle.textContent = 'Import';
        els.jobState.textContent = 'Could not start';
        els.log.textContent = msg;
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    async function poll() {
        if (!jobId) return stopPolling();
        try {
            const resp = await fetch(`${API}/jobs/${jobId}`);
            if (!resp.ok) return stopPolling();
            showJob(await resp.json());
        } catch (_) { /* server restarting: try again next tick */ }
    }

    async function refreshStatus() {
        if (!bind()) return;
        try {
            const resp = await fetch(`${API}/status`);
            const st = await resp.json();
            els.unavailable.classList.toggle('hidden', !!st.available);
            els.unavailable.textContent = st.available ? '' : st.reason;
            if (st.job) showJob(st.job);
        } catch (e) {
            els.unavailable.classList.remove('hidden');
            els.unavailable.textContent = `Could not reach the importer: ${e.message}`;
        }
    }

    async function upload(fileList) {
        const files = Array.from(fileList || []).filter((f) => f.name.toLowerCase().endsWith('.psarc'));
        if (!files.length) return showError('Only .psarc files can be imported here.');
        const form = new FormData();
        for (const f of files) form.append('file', f);
        showJob({ id: null, label: files.length === 1 ? files[0].name : `${files.length} files`, state: 'queued', lines: ['Copying the files to the server…'] });
        stopPolling();
        try {
            const resp = await fetch(`${API}/upload`, { method: 'POST', body: form });
            if (!resp.ok) return showError(await errorText(resp));
            showJob(await resp.json());
        } catch (e) {
            showError(e.message);
        }
    }

    async function convertPath() {
        const path = els.path.value.trim();
        if (!path) return;
        try {
            const resp = await fetch(`${API}/path`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path }),
            });
            if (!resp.ok) return showError(await errorText(resp));
            showJob(await resp.json());
        } catch (e) {
            showError(e.message);
        }
    }

    // Lets the library's own "add songs" drop hand .psarc files to this screen.
    window.feedBackPackImport = function (files) {
        if (typeof window.showScreen === 'function') window.showScreen(SCREEN);
        bind();
        upload(files);
    };

    const bus = window.feedBack || window.slopsmith;
    if (bus) {
        bus.on('screen:changed', (e) => {
            const id = e && e.detail && e.detail.id;
            if (id === SCREEN) refreshStatus();
            else stopPolling();
        });
    }
    if (document.getElementById(SCREEN)?.classList.contains('active')) refreshStatus();
})();
