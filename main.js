(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let isInitialized = false;
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const baseMidiC4 = 60; // middle C
    const pianoRange = { min: 21, max: 108 };
    const blackKeyOffsets = new Set([1, 3, 6, 8, 10]);
    const pianoLayoutConfig = {
        whiteKeyCount: 52,
        minWhiteKeyWidth: 16,
        minBlackKeyWidth: 10,
        blackKeyRatio: 0.64
    };

    // 检查 soundfont-player
    let soundfontAvailable = false;
    const sfCache = {};
    const sfLoadPromises = {};
    const chordPlaybackTokens = new Map();
    let chordPlaybackTokenSeq = 0;
    let hasUnlockedAudio = false;
    const pendingVoiceLoads = new Map();
    
    // 键位到和弦
    const chordMap = {
        '1': { name: 'C', offs: [0, 4, 7] },
        'q': { name: 'Cm', offs: [0, 3, 7] },
        'a': { name: 'C7', offs: [0, 4, 7, 10] },
        'z': { name: 'Cm7', offs: [0, 3, 7, 10] },


        '2': { name: 'Dm', offs: [2, 5, 9] },
        'w': { name: 'D', offs: [2, 6, 9] },
        's': { name: 'D7', offs: [2, 6, 9, 12] },
        'x': { name: 'Dm7', offs: [2, 5, 9, 12] },


        '3': { name: 'Em', offs: [4, 7, 11] },
        'e': { name: 'E', offs: [4, 8, 11] },
        'd': { name: 'E7', offs: [4, 8, 11, 14] },
        'c': { name: 'Em7', offs: [4, 7, 11, 14] },
        

        '4': { name: 'F', offs: [5, 9, 12] },
        'r': { name: 'Fm', offs: [5, 8, 12] },
        'f': { name: 'F7', offs: [5, 9, 12, 15] },
        'v': { name: 'Fm7', offs: [5, 8, 12, 15] },

        '5': { name: 'G', offs: [7, 11, 14] },
        't': { name: 'Gm', offs: [7, 10, 14] },
        'g': { name: 'G7', offs: [7, 11, 14, 17] },
        'b': { name: 'Gm7', offs: [7, 10, 14, 17] },

        '6': { name: 'Am', offs: [9, 12, 16] },
        'y': { name: 'A', offs: [9, 13, 16] },
        'h': { name: 'A7', offs: [9, 13, 16, 19] },
        'n': { name: 'Am7', offs: [9, 12, 16, 19] },

        '7': { name: 'Bdim', offs: [11, 14, 17] },

        '0': { name: 'Gsus4', offs: [7, 12, 14] }
    };

    const tonicSelect = document.getElementById('tonic');
    const octaveSelect = document.getElementById('octave');
    const voiceSelect = document.getElementById('voice');
    const tonicToggleEl = document.getElementById('tonic-toggle');
    const tonicCurrentEl = document.getElementById('tonic-current');
    const tonicEditorEl = document.getElementById('tonic-editor');
    const tonicOutputEl = document.getElementById('tonic-output');
    const tonicRangeEl = document.getElementById('tonic-range');
    const tonicScaleEl = document.getElementById('tonic-scale');
    const octaveToggleEl = document.getElementById('octave-toggle');
    const octaveCurrentEl = document.getElementById('octave-current');
    const octaveEditorEl = document.getElementById('octave-editor');
    const octaveOutputEl = document.getElementById('octave-output');
    const octaveRangeEl = document.getElementById('octave-range');
    const octaveScaleEl = document.getElementById('octave-scale');
    const inversionSelect = document.getElementById('inversion');
    const inversionToggleEl = document.getElementById('inversion-toggle');
    const inversionCurrentEl = document.getElementById('inversion-current');
    const inversionEditorEl = document.getElementById('inversion-editor');
    const inversionOutputEl = document.getElementById('inversion-output');
    const inversionRangeEl = document.getElementById('inversion-range');
    const inversionScaleEl = document.getElementById('inversion-scale');
    const voiceToggleEl = document.getElementById('voice-toggle');
    const voiceCurrentEl = document.getElementById('voice-current');
    const voiceEditorEl = document.getElementById('voice-editor');
    const voiceOutputEl = document.getElementById('voice-output');
    const voiceOptionsEl = document.getElementById('voice-options');
    const statusEl = document.getElementById('status');
    const voiceLoadingOverlayEl = document.getElementById('voice-loading-overlay');
    const voiceLoadingTitleEl = document.getElementById('voice-loading-title');
    const voiceLoadingDetailEl = document.getElementById('voice-loading-detail');
    const voiceLoadingProgressEl = document.getElementById('voice-loading-progress');
    const keyboardEl = document.getElementById('keyboard-visualization');
    const pianoEl = document.getElementById('piano-visualization');
    const octaveValues = [-24, -12, 0, 12];
    const inversionValues = [0, 1, 2];
    const voiceChoiceMeta = {
        grand_piano: {
            short: '大钢琴',
            long: '大钢琴',
            hint: '清晰颗粒',
            instrument: 'acoustic_grand_piano',
            sustained: false,
            fallbackType: 'triangle',
            attack: 0.003,
            release: 0.95
        },
        bright_piano: {
            short: '亮钢琴',
            long: '明亮钢琴',
            hint: '更亮更脆',
            instrument: 'bright_acoustic_piano',
            sustained: false,
            fallbackType: 'square',
            attack: 0.002,
            release: 0.82
        },
        electric_piano_1: {
            short: '电钢 I',
            long: '电钢琴 I',
            hint: '柔亮和弦',
            instrument: 'electric_piano_1',
            sustained: false,
            fallbackType: 'triangle',
            attack: 0.01,
            release: 1.1
        },
        electric_piano_2: {
            short: '电钢 II',
            long: '电钢琴 II',
            hint: '更软更宽',
            instrument: 'electric_piano_2',
            sustained: false,
            fallbackType: 'sine',
            attack: 0.018,
            release: 1.25
        },
        strings_ensemble_1: {
            short: '弦乐 I',
            long: '弦乐合奏 I',
            hint: '厚实铺底',
            instrument: 'string_ensemble_1',
            sustained: true,
            fallbackType: 'sawtooth',
            attack: 0.2,
            release: 1.7
        },
        strings_ensemble_2: {
            short: '弦乐 II',
            long: '弦乐合奏 II',
            hint: '更柔更轻',
            instrument: 'string_ensemble_2',
            sustained: true,
            fallbackType: 'triangle',
            attack: 0.24,
            release: 1.9
        },
        drawbar_organ: {
            short: '击杆琴',
            long: '击杆风琴',
            hint: '稳定和声',
            instrument: 'drawbar_organ',
            sustained: true,
            fallbackType: 'square',
            attack: 0.02,
            release: 0.35
        },
        church_organ: {
            short: '管风琴',
            long: '教堂管风琴',
            hint: '庄严厚重',
            instrument: 'church_organ',
            sustained: true,
            fallbackType: 'square',
            attack: 0.04,
            release: 0.55
        },
        warm_pad: {
            short: 'Warm Pad',
            long: 'Warm Pad',
            hint: '柔和氛围',
            instrument: 'pad_2_warm',
            sustained: true,
            fallbackType: 'sine',
            attack: 0.28,
            release: 2.2
        },
        polysynth_pad: {
            short: 'Poly Pad',
            long: 'Polysynth Pad',
            hint: '合成铺底',
            instrument: 'pad_3_polysynth',
            sustained: true,
            fallbackType: 'sawtooth',
            attack: 0.18,
            release: 1.8
        },
        choir_aahs: {
            short: 'Aahs',
            long: 'Choir Aahs',
            hint: '合唱垫底',
            instrument: 'choir_aahs',
            sustained: true,
            fallbackType: 'sine',
            attack: 0.26,
            release: 2
        },
        cello: {
            short: 'Cello',
            long: 'Cello',
            hint: '温暖厚实',
            instrument: 'cello',
            sustained: true,
            fallbackType: 'triangle',
            attack: 0.12,
            release: 1.7
        },
        french_horn: {
            short: 'Horn',
            long: 'French Horn',
            hint: '庄重宽广',
            instrument: 'french_horn',
            sustained: true,
            fallbackType: 'sawtooth',
            attack: 0.1,
            release: 1.5
        },
        clarinet: {
            short: 'Clarinet',
            long: 'Clarinet',
            hint: '木管质感',
            instrument: 'clarinet',
            sustained: true,
            fallbackType: 'square',
            attack: 0.06,
            release: 1.25
        }
    };
    const octaveChoiceMeta = {
        '-24': { short: '低两组', long: '低两个八度', mark: '低二' },
        '-12': { short: '低一组', long: '低一个八度', mark: '低一' },
        '0': { short: '原始', long: '原始音域', mark: '原始' },
        '12': { short: '高一组', long: '高一个八度', mark: '高一' }
    };
    const inversionChoiceMeta = {
        '0': { short: '原位', long: '原位', mark: '原位' },
        '1': { short: '一转', long: '第一转位', mark: '一转' },
        '2': { short: '二转', long: '第二转位', mark: '二转' }
    };

    // 初始化选项
    for (let i = 0; i < 12; i++) {
        const opt = document.createElement('option'); 
        opt.value = i; 
        opt.textContent = noteNames[i];
        tonicSelect.appendChild(opt);
    }

    // 工具函数
    function midiToFreq(m) { 
        return 440 * Math.pow(2, (m - 69) / 12); 
    }
    
    function midiToNoteName(m) {
        const n = ((m % 12) + 12) % 12;
        const octave = Math.floor(m / 12) - 1;
        return noteNames[n] + octave;
    }

    function setSelectValue(selectEl, value) {
        const nextValue = String(value);
        if (selectEl.value === nextValue) return;

        selectEl.value = nextValue;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function getVoicePreset(value = voiceSelect.value) {
        return voiceChoiceMeta[value] || voiceChoiceMeta.grand_piano;
    }

    function getVoiceLabel(value = voiceSelect.value) {
        const meta = getVoicePreset(value);
        return meta.long || meta.short || value;
    }

    function updateSoundfontAvailability() {
        soundfontAvailable = typeof Soundfont !== 'undefined';
        return soundfontAvailable;
    }

    function ensureAudioContext() {
        if (ctx) return ctx;

        ctx = new AudioContext();
        isInitialized = true;
        updateSoundfontAvailability();
        console.log('Soundfont available:', soundfontAvailable);
        return ctx;
    }

    function createChordPlaybackToken(key) {
        const token = ++chordPlaybackTokenSeq;
        chordPlaybackTokens.set(key, token);
        return token;
    }

    function isChordPlaybackCurrent(key, token) {
        return chordPlaybackTokens.get(key) === token && activeSet.has(key);
    }

    function getIdleStatusMessage() {
        return hasUnlockedAudio
            ? '切换音色会自动预加载，按下映射键即可演奏。'
            : '切换音色会自动预加载，首次按键会自动启用音频。';
    }

    function updateStatusMessage(message) {
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    function updateIdleStatusMessage() {
        if (activeSet.size > 0 || pendingVoiceLoads.size > 0) return;
        updateStatusMessage(getIdleStatusMessage());
    }

    function refreshVoiceLoadingOverlay() {
        if (!voiceLoadingOverlayEl || !voiceLoadingTitleEl || !voiceLoadingDetailEl || !voiceLoadingProgressEl) {
            return;
        }

        if (pendingVoiceLoads.size === 0) {
            voiceLoadingOverlayEl.hidden = true;
            voiceLoadingProgressEl.setAttribute('aria-valuetext', '音源未在加载');
            return;
        }

        const pendingLoads = Array.from(pendingVoiceLoads.values());
        const latestLoad = pendingLoads[pendingLoads.length - 1];
        voiceLoadingTitleEl.textContent = `正在加载 ${latestLoad.label}`;
        voiceLoadingDetailEl.textContent = latestLoad.detail;
        voiceLoadingProgressEl.setAttribute('aria-valuetext', `${latestLoad.label} 音源加载中`);
        voiceLoadingOverlayEl.hidden = false;
    }

    function beginVoiceLoading(voiceValue, detail = '正在准备当前音色资源...') {
        const preset = getVoicePreset(voiceValue);
        pendingVoiceLoads.set(preset.instrument, {
            label: getVoiceLabel(voiceValue),
            detail
        });
        refreshVoiceLoadingOverlay();
        return preset.instrument;
    }

    function buildSliderScale(containerEl, items, onSelect) {
        if (!containerEl) return;

        containerEl.innerHTML = '';
        const lastIndex = Math.max(items.length - 1, 1);
        items.forEach(item => {
            const mark = document.createElement('button');
            mark.type = 'button';
            mark.className = 'slider-mark';
            mark.dataset.value = String(item.value);
            mark.textContent = item.label;
            if (typeof item.index === 'number') {
                mark.style.left = `${(item.index / lastIndex) * 100}%`;
            }
            mark.addEventListener('click', () => onSelect(item.value));
            containerEl.appendChild(mark);
        });
    }

    function updateSliderScale(containerEl, value) {
        if (!containerEl) return;

        containerEl.querySelectorAll('.slider-mark').forEach(mark => {
            mark.classList.toggle('is-active', mark.dataset.value === String(value));
        });
    }

    function updateTonicUI() {
        const value = Number(tonicSelect.value);
        const label = noteNames[value];

        tonicCurrentEl.textContent = label;
        tonicOutputEl.textContent = label;
        tonicRangeEl.value = String(value);
        updateSliderScale(tonicScaleEl, value);
    }

    function updateOctaveUI() {
        const value = String(octaveSelect.value);
        const meta = octaveChoiceMeta[value];
        const rangeIndex = octaveValues.indexOf(Number(value));

        octaveCurrentEl.textContent = meta.short;
        octaveOutputEl.textContent = meta.long;
        octaveRangeEl.value = String(rangeIndex);
        updateSliderScale(octaveScaleEl, rangeIndex);
    }

    function updateInversionUI() {
        const value = String(inversionSelect.value);
        const meta = inversionChoiceMeta[value];
        const rangeIndex = inversionValues.indexOf(Number(value));

        inversionCurrentEl.textContent = meta.short;
        inversionOutputEl.textContent = meta.long;
        inversionRangeEl.value = String(rangeIndex);
        updateSliderScale(inversionScaleEl, rangeIndex);
    }

    function buildVoiceOptions() {
        if (!voiceOptionsEl) return;

        voiceOptionsEl.innerHTML = '';
        Array.from(voiceSelect.options).forEach(option => {
            const meta = voiceChoiceMeta[option.value] || {
                short: option.textContent,
                long: option.textContent,
                hint: ''
            };
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'voice-option';
            button.dataset.value = option.value;
            button.setAttribute('role', 'option');
            button.innerHTML = `
                <span class="voice-option-name">${meta.long}</span>
                <span class="voice-option-hint">${meta.hint}</span>
            `;
            button.addEventListener('click', () => {
                setSelectValue(voiceSelect, option.value);
                closeSliderEditors();
            });
            voiceOptionsEl.appendChild(button);
        });
    }

    function updateVoiceUI() {
        const value = voiceSelect.value;
        const selectedOption = voiceSelect.selectedOptions[0];
        const meta = voiceChoiceMeta[value] || {
            short: selectedOption?.textContent || value,
            long: selectedOption?.textContent || value
        };

        if (voiceCurrentEl) voiceCurrentEl.textContent = meta.short;
        if (voiceOutputEl) voiceOutputEl.textContent = meta.long;

        if (voiceOptionsEl) {
            voiceOptionsEl.querySelectorAll('.voice-option').forEach(optionEl => {
                const isActive = optionEl.dataset.value === value;
                optionEl.classList.toggle('is-active', isActive);
                optionEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        }
    }

    function setSliderEditorOpen(type, shouldOpen) {
        const controls = {
            tonic: { toggle: tonicToggleEl, editor: tonicEditorEl, focusTarget: tonicRangeEl },
            octave: { toggle: octaveToggleEl, editor: octaveEditorEl, focusTarget: octaveRangeEl },
            inversion: { toggle: inversionToggleEl, editor: inversionEditorEl, focusTarget: inversionRangeEl },
            voice: {
                toggle: voiceToggleEl,
                editor: voiceEditorEl,
                focusTarget: () => voiceEditorEl?.querySelector('.voice-option.is-active') || voiceEditorEl?.querySelector('.voice-option')
            }
        };

        Object.entries(controls).forEach(([name, control]) => {
            const open = shouldOpen && name === type;
            control.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            control.editor.hidden = !open;

            if (open) {
                requestAnimationFrame(() => {
                    const focusTarget = typeof control.focusTarget === 'function'
                        ? control.focusTarget()
                        : control.focusTarget;
                    focusTarget?.focus?.({ preventScroll: true });
                });
            }
        });
    }

    function closeSliderEditors() {
        setSliderEditorOpen('', false);
    }

    function isBlackKey(midi) {
        return blackKeyOffsets.has(((midi % 12) + 12) % 12);
    }

    function getModifierOctaveOffset() {
        let offset = 0;
        if (modifierKeys.arrowUp) offset += 12;
        if (modifierKeys.arrowDown) offset -= 12;
        return offset;
    }

    function normalizeChordVoicing(midis) {
        return [...midis].sort((a, b) => a - b);
    }

    function getPitchClass(midi) {
        return ((midi % 12) + 12) % 12;
    }

    function findHighestIndexByPitchClass(midis, pitchClass) {
        for (let i = midis.length - 1; i >= 0; i -= 1) {
            if (getPitchClass(midis[i]) === pitchClass) return i;
        }
        return -1;
    }

    function getTemporaryInversionDirection() {
        if (modifierKeys.arrowLeft === modifierKeys.arrowRight) return 0;
        return modifierKeys.arrowRight ? 1 : -1;
    }

    function moveLowestNoteToTop(midis, fifthPitchClass = null, seventhPitchClass = null) {
        if (midis.length < 2) return normalizeChordVoicing(midis);

        const nextMidis = normalizeChordVoicing(midis);
        const movingIndexes = [0];

        if (
            seventhPitchClass !== null &&
            fifthPitchClass !== null &&
            getPitchClass(nextMidis[0]) === fifthPitchClass
        ) {
            const seventhIndex = findHighestIndexByPitchClass(nextMidis, seventhPitchClass);
            if (seventhIndex > 0) {
                movingIndexes.push(seventhIndex);
            }
        }

        return normalizeChordVoicing(nextMidis.map((midi, index) => (
            movingIndexes.includes(index) ? midi + 12 : midi
        )));
    }

    function moveHighestNoteToBottom(midis, info, fifthPitchClass = null, seventhPitchClass = null) {
        if (midis.length < 2) return normalizeChordVoicing(midis);

        const nextMidis = normalizeChordVoicing(midis);
        let movableTopIndex = nextMidis.length - 1;

        if (
            info.offs.length >= 4 &&
            seventhPitchClass !== null &&
            getPitchClass(nextMidis[movableTopIndex]) === seventhPitchClass &&
            movableTopIndex > 0
        ) {
            movableTopIndex -= 1;
        }

        const movingIndexes = [movableTopIndex];

        if (
            seventhPitchClass !== null &&
            fifthPitchClass !== null &&
            getPitchClass(nextMidis[movableTopIndex]) === fifthPitchClass
        ) {
            const seventhIndex = findHighestIndexByPitchClass(nextMidis, seventhPitchClass);
            if (seventhIndex > movableTopIndex) {
                movingIndexes.push(seventhIndex);
            }
        }

        return normalizeChordVoicing(nextMidis.map((midi, index) => (
            movingIndexes.includes(index) ? midi - 12 : midi
        )));
    }

    function applyConfiguredInversion(midis, info, inversionMode, fifthPitchClass, seventhPitchClass) {
        if (inversionMode === 1) {
            return moveLowestNoteToTop(midis, fifthPitchClass, seventhPitchClass);
        }
        if (inversionMode === 2) {
            return moveHighestNoteToBottom(midis, info, fifthPitchClass, seventhPitchClass);
        }
        return normalizeChordVoicing(midis);
    }

    function getChordPlaybackState(key) {
        const info = chordMap[key];
        if (!info) return null;

        const tonic = +tonicSelect.value;
        const octave = +octaveSelect.value;
        const voice = voiceSelect.value;
        const tempOctaveOffset = getModifierOctaveOffset();
        const configuredInversionMode = Number(inversionSelect.value);
        const temporaryInversionDirection = getTemporaryInversionDirection();
        const baseMidis = normalizeChordVoicing(
            info.offs.map(offset => baseMidiC4 + offset + tonic + octave + tempOctaveOffset)
        );
        const fifthPitchClass = info.offs.length >= 3
            ? getPitchClass(baseMidis[2])
            : null;
        const seventhPitchClass = info.offs.length >= 4
            ? getPitchClass(baseMidis[3])
            : null;
        let midis = applyConfiguredInversion(
            baseMidis,
            info,
            configuredInversionMode,
            fifthPitchClass,
            seventhPitchClass
        );

        if (temporaryInversionDirection > 0) {
            midis = moveLowestNoteToTop(midis, fifthPitchClass, seventhPitchClass);
        } else if (temporaryInversionDirection < 0) {
            midis = moveHighestNoteToBottom(midis, info, fifthPitchClass, seventhPitchClass);
        }

        return {
            info,
            tonic,
            octave,
            voice,
            tempOctaveOffset,
            configuredInversionMode,
            temporaryInversionDirection,
            midis
        };
    }

    function toVisiblePianoMidis(midis) {
        return midis.filter(midi => midi >= pianoRange.min && midi <= pianoRange.max);
    }

    function togglePianoKey(midi, isActive) {
        const keyEl = pianoKeyEls.get(midi);
        if (!keyEl) return;
        keyEl.classList.toggle('active', isActive);
    }

    function setChordPianoNotes(key, nextMidis) {
        const prevMidis = activeChordPianoNotes.get(key) || [];
        const prevSet = new Set(prevMidis);
        const nextSet = new Set(toVisiblePianoMidis(nextMidis));

        prevSet.forEach(midi => {
            if (nextSet.has(midi)) return;
            const nextCount = (activeMidiUsage.get(midi) || 0) - 1;
            if (nextCount > 0) {
                activeMidiUsage.set(midi, nextCount);
            } else {
                activeMidiUsage.delete(midi);
                togglePianoKey(midi, false);
            }
        });

        nextSet.forEach(midi => {
            if (prevSet.has(midi)) return;
            const nextCount = (activeMidiUsage.get(midi) || 0) + 1;
            activeMidiUsage.set(midi, nextCount);
            togglePianoKey(midi, true);
        });

        if (nextSet.size > 0) {
            activeChordPianoNotes.set(key, [...nextSet]);
        } else {
            activeChordPianoNotes.delete(key);
        }
    }

    function releaseChordPianoNotes(key) {
        setChordPianoNotes(key, []);
    }

    // 初始化音频系统
    async function initAudio() {
        if (isInitialized) return true;
        
        try {
            // 1. 创建 AudioContext
            ctx = new AudioContext();
            
            // 2. 检查 soundfont
            soundfontAvailable = typeof Soundfont !== 'undefined';
            console.log('Soundfont 可用:', soundfontAvailable);
            
            // 3. 如果有 soundfont，预加载默认音色
            if (soundfontAvailable) {
                const defaultInst = getVoicePreset().instrument;
                statusEl.textContent = '正在加载音色...';
                
                try {
                    const inst = await Soundfont.instrument(ctx, defaultInst);
                    sfCache[defaultInst] = inst;
                    console.log('音色预加载成功:', defaultInst);
                } catch (err) {
                    console.warn('音色预加载失败，将使用回退音色:', err);
                }
            }
            
            isInitialized = true;
            statusEl.textContent = '音频已初始化，可以开始演奏！';
            return true;
            
        } catch (error) {
            console.error('音频初始化失败:', error);
            statusEl.textContent = '音频初始化失败，但可以使用基础音色';
            // 即使失败，也尝试继续
            ctx = new AudioContext();
            isInitialized = true;
            return false;
        }
    }

    // 加载音色函数
    async function loadInstrument(name) {
        if (!soundfontAvailable) throw new Error('Soundfont not available');
        if (sfCache[name]) return sfCache[name];
        
        const inst = await Soundfont.instrument(ctx, name);
        sfCache[name] = inst;
        return inst;
    }

    async function initAudio() {
        try {
            ensureAudioContext();

            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            hasUnlockedAudio = ctx.state === 'running';

            if (updateSoundfontAvailability()) {
                void preloadVoice(voiceSelect.value);
            }

            updateIdleStatusMessage();
            return hasUnlockedAudio;
        } catch (error) {
            console.error('Audio init failed:', error);
            updateStatusMessage('音频初始化失败，已切换到基础音色。');
            try {
                if (!ctx) {
                    ctx = new AudioContext();
                    isInitialized = true;
                }
            } catch (fallbackError) {
                console.error('AudioContext fallback failed:', fallbackError);
            }

            hasUnlockedAudio = Boolean(ctx) && ctx.state === 'running';
            return false;
        }
    }

    async function loadInstrument(name) {
        ensureAudioContext();
        if (!updateSoundfontAvailability()) throw new Error('Soundfont not available');
        if (sfCache[name]) return sfCache[name];
        if (sfLoadPromises[name]) return sfLoadPromises[name];

        sfLoadPromises[name] = Soundfont.instrument(ctx, name)
            .then(inst => {
                sfCache[name] = inst;
                return inst;
            })
            .finally(() => {
                delete sfLoadPromises[name];
            });

        return sfLoadPromises[name];
    }

    async function preloadVoice(voiceValue = voiceSelect.value, options = {}) {
        const { announce = false } = options;
        const preset = getVoicePreset(voiceValue);
        const label = getVoiceLabel(voiceValue);
        let overlayKey = null;

        try {
            if (sfCache[preset.instrument]) return sfCache[preset.instrument];

            ensureAudioContext();
            if (!updateSoundfontAvailability()) return null;

            overlayKey = beginVoiceLoading(
                voiceValue,
                announce ? '正在下载音源并写入缓存...' : '正在后台预热当前音色...'
            );

            const inst = await loadInstrument(preset.instrument);

            if (announce && activeSet.size === 0 && voiceSelect.value === voiceValue) {
                updateStatusMessage(`${label} 音色已就绪。`);
            }

            return inst;
        } catch (err) {
            console.warn('Voice preload failed, fallback will be used:', err);

            if (announce && activeSet.size === 0 && voiceSelect.value === voiceValue) {
                updateStatusMessage(`${label} 音源加载失败，已使用基础音色。`);
            }

            return null;
        } finally {
            if (overlayKey) {
                pendingVoiceLoads.delete(overlayKey);
                refreshVoiceLoadingOverlay();
            }

            if (pendingVoiceLoads.size === 0) {
                updateIdleStatusMessage();
            }
        }
    }

    // 停止和弦（用于弦乐音色）
    function stopChord(key) {
        const notes = activePlayingNotes.get(key);
        if (!notes) return;
        if (!ctx) {
            activePlayingNotes.delete(key);
            return;
        }
        
        const now = ctx.currentTime;
        notes.forEach(node => {
            try {
                if (node.stop) {
                    node.stop(now);
                } else if (node.gain) {
                    // fallback模式：停止oscillator
                    node.gain.gain.cancelScheduledValues(now);
                    const releaseTime = node.releaseTime || 0.06;
                    const currentGain = Math.max(node.gain.gain.value, 0.0001);
                    node.gain.gain.setValueAtTime(currentGain, now);
                    node.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);
                    if (node.osc) {
                        node.osc.stop(now + releaseTime + 0.01);
                    }
                }
            } catch (e) {
                // 忽略已停止的节点错误
                console.debug('停止音符时出错（可能已停止）:', e);
            }
        });
        activePlayingNotes.delete(key);
    }

    function getFallbackOscillatorType(voicePreset) {
        if (voicePreset.sustained) {
            return voicePreset.fallbackType === 'sine' ? 'sine' : 'triangle';
        }

        if (voicePreset.fallbackType === 'triangle' || voicePreset.fallbackType === 'sine') {
            return voicePreset.fallbackType;
        }

        return 'triangle';
    }

    function getFallbackPeakGain(voicePreset, noteIndex) {
        const baseGain = voicePreset.sustained ? 0.16 : 0.14;
        return baseGain / (1 + noteIndex * 0.45);
    }
    
    // 播放和弦
    async function playChord(key) {
        const playbackState = getChordPlaybackState(key);
        if (!playbackState) return;

        const { info, voice, configuredInversionMode, temporaryInversionDirection, midis } = playbackState;
        const voicePreset = getVoicePreset(voice);
        
        // 如果是弦乐音色，先停止之前播放的音符
        if (voicePreset.sustained) {
            stopChord(key);
        }

        setChordPianoNotes(key, midis);
        
        // 更新状态
        let statusText = `播放：${info.name}（键 ${key.toUpperCase()}）`;
        if (modifierKeys.arrowUp) statusText += ' ↑+1八度';
        if (modifierKeys.arrowDown) statusText += ' ↓-1八度';
        statusText += ` ${inversionChoiceMeta[String(configuredInversionMode)].long}`;
        if (temporaryInversionDirection !== 0) {
            statusText += temporaryInversionDirection > 0 ? ' →临时上转位' : ' ←临时下转位';
        }
        statusEl.textContent = statusText;
        
        // 确保音频已初始化
        if (!isInitialized) {
            await initAudio();
        }
        
        // 确保 AudioContext 处于运行状态
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        
        const now = ctx.currentTime;
        const playingNotes = [];
        
        // 尝试使用 soundfont
        if (soundfontAvailable) {
            try {
                const instName = voicePreset.instrument;
                const inst = await loadInstrument(instName);
                
                midis.forEach((midi, i) => {
                    const note = midiToNoteName(midi);
                    const soundfontPlayOptions = voicePreset.sustained
                        ? { gain: 0.85 / (i + 1) }
                        : { gain: 0.85 / (i + 1), duration: Math.max(1.2, voicePreset.release + 0.9) };
                    const playOptions = voice === 'strings' 
                        ? { gain: 0.85 / (i + 1) } // 弦乐：不设置duration，持续播放
                        : { gain: 0.85 / (i + 1), duration: 2 }; // 钢琴：设置duration
                    
                    const audioNode = inst.play(note, now, soundfontPlayOptions);
                    if (voicePreset.sustained && audioNode) {
                        playingNotes.push(audioNode);
                    }
                });
                
                // 如果是弦乐音色，存储播放的音符
                if (voicePreset.sustained && playingNotes.length > 0) {
                    activePlayingNotes.set(key, playingNotes);
                }
                return;
            } catch (err) {
                console.warn('Soundfont 播放失败，使用回退音色:', err);
            }
        }
        
        // 回退到 Oscillator
        const fallbackNotes = playChordFallback(midis, voicePreset);
        if (voicePreset.sustained && fallbackNotes.length > 0) {
            activePlayingNotes.set(key, fallbackNotes);
        }
    }
    
    function playChordFallback(midis, voicePreset) {
        const now = ctx.currentTime;
        const nodes = [];
        
        midis.forEach((midi, i) => {
            const freq = midiToFreq(midi);
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            
            const type = getFallbackOscillatorType(voicePreset);
            const attack = Math.max(voicePreset.attack, voicePreset.sustained ? 0.05 : 0.012);
            const release = voicePreset.sustained
                ? Math.min(Math.max(voicePreset.release * 0.72, 0.5), 1.35)
                : Math.min(Math.max(voicePreset.release * 0.55, 0.24), 0.72);
            const peakGain = getFallbackPeakGain(voicePreset, i);
            
            osc.type = type; 
            osc.frequency.value = freq;
            filter.type = 'lowpass';
            filter.frequency.value = voicePreset.sustained ? 1700 : 2400;
            filter.Q.value = 0.35;
            
            if (voicePreset.sustained) {
                // 弦乐音色：持续播放，不自动停止
                g.gain.setValueAtTime(0.0001, now);
                g.gain.linearRampToValueAtTime(peakGain, now + attack);
                g.gain.setValueAtTime(peakGain, now + attack + 0.01);
                nodes.push({ osc, gain: g, releaseTime: 0.08 });
            } else {
                // 钢琴音色：自动停止
                g.gain.setValueAtTime(0.0001, now);
                g.gain.linearRampToValueAtTime(peakGain, now + attack);
                g.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
                osc.stop(now + attack + release + 0.05);
            }
            
            osc.connect(filter);
            filter.connect(g);
            g.connect(ctx.destination);
            osc.start(now);
        });
        
        return nodes;
    }

    async function playChord(key) {
        const playbackState = getChordPlaybackState(key);
        if (!playbackState) return;

        const playbackToken = createChordPlaybackToken(key);
        const { info, voice, configuredInversionMode, temporaryInversionDirection, midis } = playbackState;
        const voicePreset = getVoicePreset(voice);

        if (voicePreset.sustained) {
            stopChord(key);
        }

        setChordPianoNotes(key, midis);

        let statusText = `播放：${info.name}（键 ${key.toUpperCase()}）`;
        if (modifierKeys.arrowUp) statusText += ' ↑+1八度';
        if (modifierKeys.arrowDown) statusText += ' ↓-1八度';
        statusText += ` ${inversionChoiceMeta[String(configuredInversionMode)].long}`;
        if (temporaryInversionDirection !== 0) {
            statusText += temporaryInversionDirection > 0 ? ' →临时上转位' : ' ←临时下转位';
        }
        updateStatusMessage(statusText);

        try {
            ensureAudioContext();

            if (!hasUnlockedAudio || ctx.state === 'suspended') {
                await initAudio();
            }
        } catch (error) {
            console.warn('Audio unlock failed, fallback will be used:', error);
        }

        if (!ctx || !isChordPlaybackCurrent(key, playbackToken)) return;

        const now = ctx.currentTime;
        const playingNotes = [];

        if (updateSoundfontAvailability()) {
            const instName = voicePreset.instrument;
            const inst = sfCache[instName];

            if (inst) {
                try {
                    midis.forEach((midi, i) => {
                        const note = midiToNoteName(midi);
                        const soundfontPlayOptions = voicePreset.sustained
                            ? { gain: 0.85 / (i + 1) }
                            : { gain: 0.85 / (i + 1), duration: Math.max(1.2, voicePreset.release + 0.9) };

                        const audioNode = inst.play(note, now, soundfontPlayOptions);
                        if (voicePreset.sustained && audioNode) {
                            playingNotes.push(audioNode);
                        }
                    });

                    if (voicePreset.sustained && playingNotes.length > 0) {
                        activePlayingNotes.set(key, playingNotes);
                    }
                    return;
                } catch (err) {
                    console.warn('Soundfont playback failed, fallback will be used:', err);
                }
            } else {
                void preloadVoice(voice);
                updateStatusMessage(`${statusText} · 音源加载中，先用柔和回退音色`);
            }
        }

        if (!isChordPlaybackCurrent(key, playbackToken)) return;

        const fallbackNotes = playChordFallback(midis, voicePreset);
        if (voicePreset.sustained && fallbackNotes.length > 0) {
            activePlayingNotes.set(key, fallbackNotes);
        }
    }

    // QWERTY 键盘布局（标准布局）
    const keyboardLayout = [
        ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\''],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
    ];
    const modifierKeyMeta = [
        { key: 'ArrowUp', symbol: '↑', label: '升八度', row: 'top' },
        { key: 'ArrowLeft', symbol: '←', label: '下转位', row: 'bottom' },
        { key: 'ArrowDown', symbol: '↓', label: '降八度', row: 'bottom' },
        { key: 'ArrowRight', symbol: '→', label: '上转位', row: 'bottom' }
    ];

    function createKeyboardModifierKey({ key, symbol, label }) {
        const keyEl = document.createElement('div');
        keyEl.className = 'keyboard-key mapped keyboard-key-modifier';
        keyEl.id = 'key-' + key;
        keyEl.innerHTML = `
            <span class="key-label">${symbol}</span>
            <span class="chord-label modifier-label">${label}</span>
        `;
        bindVirtualKeyPointerHandlers(keyEl, key, 'modifier');
        return keyEl;
    }

    // 创建可视化键盘
    function createKeyboardVisualization() {
        keyboardEl.innerHTML = '';

        const keyboardContainer = document.createElement('div');
        keyboardContainer.className = 'keyboard-container';
        const keyboardLayoutEl = document.createElement('div');
        keyboardLayoutEl.className = 'keyboard-layout';
        const keyboardMainEl = document.createElement('div');
        keyboardMainEl.className = 'keyboard-main';
        
        keyboardLayout.forEach((row, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'keyboard-row';
            
            // 为不同行添加不同的间距
            if (rowIndex === 1) {
                rowEl.style.paddingLeft = '1.5em'; // Tab键位置
            } else if (rowIndex === 2) {
                rowEl.style.paddingLeft = '2em'; // Caps Lock位置
            } else if (rowIndex === 3) {
                rowEl.style.paddingLeft = '3em'; // Shift位置
            }
            
            row.forEach(key => {
                const keyEl = document.createElement('div');
                keyEl.className = 'keyboard-key';
                keyEl.id = 'key-' + key;
                
                const keyUpper = key.toUpperCase();
                keyEl.innerHTML = `<span class="key-label">${keyUpper}</span>`;
                
                // 检查这个键是否被映射
                if (chordMap[key.toLowerCase()]) {
                    keyEl.classList.add('mapped');
                    const chordName = chordMap[key.toLowerCase()].name;
                    keyEl.innerHTML += `<span class="chord-label">${chordName}</span>`;
                    bindVirtualKeyPointerHandlers(keyEl, key.toLowerCase(), 'chord');
                }
                
                rowEl.appendChild(keyEl);
            });
            
            keyboardMainEl.appendChild(rowEl);
        });

        const modifierPadEl = document.createElement('div');
        modifierPadEl.className = 'keyboard-modifier-pad';
        const modifierTopRowEl = document.createElement('div');
        modifierTopRowEl.className = 'keyboard-modifier-row keyboard-modifier-row-top';
        const modifierBottomRowEl = document.createElement('div');
        modifierBottomRowEl.className = 'keyboard-modifier-row keyboard-modifier-row-bottom';

        modifierKeyMeta.forEach(meta => {
            const keyEl = createKeyboardModifierKey(meta);
            if (meta.row === 'top') {
                modifierTopRowEl.appendChild(keyEl);
            } else {
                modifierBottomRowEl.appendChild(keyEl);
            }
        });

        modifierPadEl.appendChild(modifierTopRowEl);
        modifierPadEl.appendChild(modifierBottomRowEl);
        keyboardLayoutEl.appendChild(keyboardMainEl);
        keyboardLayoutEl.appendChild(modifierPadEl);
        keyboardContainer.appendChild(keyboardLayoutEl);
        
        keyboardEl.appendChild(keyboardContainer);
    }

    function shouldLabelPianoKey(midi) {
        const noteIndex = ((midi % 12) + 12) % 12;
        return midi === pianoRange.min || midi === pianoRange.max || noteIndex === 0;
    }

    function createPianoVisualization() {
        if (!pianoEl) return;

        pianoEl.innerHTML = '';
        pianoKeyEls.clear();
        pianoKeys.length = 0;

        const viewport = document.createElement('div');
        viewport.className = 'piano-viewport';

        const keyboard = document.createElement('div');
        keyboard.className = 'piano-keyboard';
        for (let midi = pianoRange.min; midi <= pianoRange.max; midi++) {
            const keyEl = document.createElement('div');
            const isBlack = isBlackKey(midi);

            keyEl.className = `piano-key ${isBlack ? 'black' : 'white'}`;
            keyEl.dataset.midi = String(midi);
            keyEl.title = midiToNoteName(midi);

            if (!isBlack && shouldLabelPianoKey(midi)) {
                const label = document.createElement('span');
                label.className = 'piano-key-label';
                label.textContent = midiToNoteName(midi);
                keyEl.appendChild(label);
            }

            pianoKeyEls.set(midi, keyEl);
            pianoKeys.push({ midi, el: keyEl, isBlack });
            keyboard.appendChild(keyEl);
        }

        viewport.appendChild(keyboard);
        pianoEl.appendChild(viewport);
        pianoViewportEl = viewport;
        pianoKeyboardEl = keyboard;
        layoutPianoVisualization();
    }

    function layoutPianoVisualization() {
        if (!pianoViewportEl || !pianoKeyboardEl) return;

        const viewportStyles = window.getComputedStyle(pianoViewportEl);
        const horizontalPadding = parseFloat(viewportStyles.paddingLeft) + parseFloat(viewportStyles.paddingRight);
        const availableWidth = Math.max(0, pianoViewportEl.clientWidth - horizontalPadding);
        const whiteKeyWidth = Math.max(
            pianoLayoutConfig.minWhiteKeyWidth,
            availableWidth / pianoLayoutConfig.whiteKeyCount
        );
        const blackKeyWidth = Math.max(
            pianoLayoutConfig.minBlackKeyWidth,
            whiteKeyWidth * pianoLayoutConfig.blackKeyRatio
        );

        pianoKeyboardEl.style.width = `${whiteKeyWidth * pianoLayoutConfig.whiteKeyCount}px`;

        let whiteIndex = 0;
        pianoKeys.forEach(({ el, isBlack }) => {
            if (isBlack) {
                el.style.left = `${whiteIndex * whiteKeyWidth - (blackKeyWidth / 2)}px`;
                el.style.width = `${blackKeyWidth}px`;
            } else {
                el.style.left = `${whiteIndex * whiteKeyWidth}px`;
                el.style.width = `${whiteKeyWidth}px`;
                whiteIndex += 1;
            }
        });
    }

    function syncFixedLayout() {
        const pianoPanel = document.getElementById('piano-panel');
        if (!pianoPanel) return;

        document.documentElement.style.setProperty('--piano-panel-height', `${pianoPanel.offsetHeight}px`);
    }

    function handleViewportLayoutChange() {
        layoutPianoVisualization();
        syncFixedLayout();
    }

    function setComputerKeyPressed(key, pressed) {
        const keyEl = document.getElementById('key-' + key);
        if (keyEl) {
            keyEl.classList.toggle('pressed', pressed);
        }
    }

    const activeSet = new Set();
    const activeChordSources = new Map();
    const modifierInputSources = {
        ArrowUp: new Set(),
        ArrowDown: new Set(),
        ArrowLeft: new Set(),
        ArrowRight: new Set()
    };
    const modifierKeyMap = {
        ArrowUp: 'arrowUp',
        ArrowDown: 'arrowDown',
        ArrowLeft: 'arrowLeft',
        ArrowRight: 'arrowRight'
    };
    const activeKeyboardPointerIds = new Set();
    
    // 存储正在播放的音符（仅用于弦乐音色，以便在释放键时停止）
    const activePlayingNotes = new Map(); // key -> Array of audio nodes/notes
    const activeChordPianoNotes = new Map(); // key -> midi[]
    const activeMidiUsage = new Map(); // midi -> active chord count
    const pianoKeyEls = new Map(); // midi -> HTMLElement
    const pianoKeys = []; // { midi, el, isBlack }
    let pianoViewportEl = null;
    let pianoKeyboardEl = null;
    
    // 修饰键状态追踪
    const modifierKeys = {
        arrowUp: false,
        arrowDown: false,
        arrowLeft: false,
        arrowRight: false
    };

    function getInputSourceSet(sourceMap, key) {
        if (!sourceMap.has(key)) {
            sourceMap.set(key, new Set());
        }
        return sourceMap.get(key);
    }

    async function pressChordInput(key, source) {
        if (!chordMap[key]) return;

        const sources = getInputSourceSet(activeChordSources, key);
        if (sources.has(source)) return;

        const wasActive = sources.size > 0;
        sources.add(source);
        if (wasActive) return;

        activeSet.add(key);
        setComputerKeyPressed(key, true);
        await playChord(key);
    }

    function releaseChordInput(key, source) {
        const sources = activeChordSources.get(key);
        if (!sources || !sources.has(source)) return;

        sources.delete(source);
        if (sources.size > 0) return;

        activeChordSources.delete(key);
        releaseChord(key);
    }

    async function pressModifierInput(key, source) {
        const sources = modifierInputSources[key];
        const modifierKey = modifierKeyMap[key];
        if (!sources || !modifierKey || sources.has(source)) return;

        const wasActive = sources.size > 0;
        sources.add(source);
        if (wasActive) return;

        modifierKeys[modifierKey] = true;
        setComputerKeyPressed(key, true);
        await replayActiveChords();
    }

    async function releaseModifierInput(key, source) {
        const sources = modifierInputSources[key];
        const modifierKey = modifierKeyMap[key];
        if (!sources || !modifierKey || !sources.has(source)) return;

        sources.delete(source);
        if (sources.size > 0) return;

        modifierKeys[modifierKey] = false;
        setComputerKeyPressed(key, false);
        await replayActiveChords();
    }

    function clearActiveTextSelection() {
        const selection = window.getSelection?.();
        if (!selection || selection.rangeCount === 0) return;
        selection.removeAllRanges();
    }

    function syncKeyboardTouchState() {
        document.body.classList.toggle('keyboard-touch-active', activeKeyboardPointerIds.size > 0);
        if (activeKeyboardPointerIds.size > 0) {
            clearActiveTextSelection();
        }
    }

    function setKeyboardPointerActive(pointerId, isActive) {
        if (isActive) {
            activeKeyboardPointerIds.add(pointerId);
        } else {
            activeKeyboardPointerIds.delete(pointerId);
        }

        syncKeyboardTouchState();
    }

    function bindVirtualKeyPointerHandlers(keyEl, inputKey, inputType) {
        if (!keyEl) return;

        const releaseFromPointer = async ev => {
            if (ev.pointerType !== 'mouse') {
                setKeyboardPointerActive(ev.pointerId, false);
            }

            const source = `pointer:${ev.pointerId}`;
            if (inputType === 'modifier') {
                await releaseModifierInput(inputKey, source);
            } else {
                releaseChordInput(inputKey, source);
            }

            if (keyEl.hasPointerCapture?.(ev.pointerId)) {
                keyEl.releasePointerCapture(ev.pointerId);
            }
        };

        keyEl.addEventListener('pointerdown', async ev => {
            if (ev.pointerType === 'mouse' && ev.button !== 0) return;

            ev.preventDefault();
            if (ev.pointerType !== 'mouse') {
                setKeyboardPointerActive(ev.pointerId, true);
            }
            keyEl.setPointerCapture?.(ev.pointerId);
            const source = `pointer:${ev.pointerId}`;

            if (inputType === 'modifier') {
                await pressModifierInput(inputKey, source);
            } else {
                await pressChordInput(inputKey, source);
            }
        });

        keyEl.addEventListener('pointerup', releaseFromPointer);
        keyEl.addEventListener('pointercancel', releaseFromPointer);
        keyEl.addEventListener('lostpointercapture', releaseFromPointer);
    }

    function releaseChord(key) {
        chordPlaybackTokens.delete(key);
        activeSet.delete(key);
        releaseChordPianoNotes(key);
        stopChord(key);
        setComputerKeyPressed(key, false);
    }

    function releaseAllActiveChords() {
        activeChordSources.clear();
        Array.from(activeSet).forEach(releaseChord);
    }

    function resetModifierKeys() {
        Object.values(modifierInputSources).forEach(sourceSet => sourceSet.clear());
        modifierKeys.arrowUp = false;
        modifierKeys.arrowDown = false;
        modifierKeys.arrowLeft = false;
        modifierKeys.arrowRight = false;
        setComputerKeyPressed('ArrowUp', false);
        setComputerKeyPressed('ArrowDown', false);
        setComputerKeyPressed('ArrowLeft', false);
        setComputerKeyPressed('ArrowRight', false);
    }
    
    // 重新播放所有当前按下的和弦（用于修饰键变化时）
    async function replayActiveChords() {
        const activeKeys = Array.from(activeSet);
        activeKeys.forEach(stopChord);

        for (const key of activeKeys) {
            await playChord(key);
        }
    }
    
    // 键盘事件处理
    window.addEventListener('keydown', async (ev) => {
        // 处理修饰键
        if (ev.key === 'ArrowUp') {
            await pressModifierInput('ArrowUp', 'keyboard');
            ev.preventDefault();
            return;
        }
        if (ev.key === 'ArrowDown') {
            await pressModifierInput('ArrowDown', 'keyboard');
            ev.preventDefault();
            return;
        }
        if (ev.key === 'ArrowLeft') {
            await pressModifierInput('ArrowLeft', 'keyboard');
            ev.preventDefault();
            return;
        }
        if (ev.key === 'ArrowRight') {
            await pressModifierInput('ArrowRight', 'keyboard');
            ev.preventDefault();
            return;
        }
        
        if (ev.repeat) return;
        
        const k = ev.key.toLowerCase();
        if (chordMap[k]) {
            ev.preventDefault();
            await pressChordInput(k, 'keyboard');
        }
    });
    
    window.addEventListener('keyup', async (ev) => {
        // 处理修饰键释放
        if (ev.key === 'ArrowUp') {
            await releaseModifierInput('ArrowUp', 'keyboard');
            ev.preventDefault();
            return;
        }
        if (ev.key === 'ArrowDown') {
            await releaseModifierInput('ArrowDown', 'keyboard');
            ev.preventDefault();
            return;
        }
        if (ev.key === 'ArrowLeft') {
            await releaseModifierInput('ArrowLeft', 'keyboard');
            ev.preventDefault();
            return;
        }
        if (ev.key === 'ArrowRight') {
            await releaseModifierInput('ArrowRight', 'keyboard');
            ev.preventDefault();
            return;
        }
        
        const k = ev.key.toLowerCase();
        if (!chordMap[k]) return;

        ev.preventDefault();
        releaseChordInput(k, 'keyboard');
    });

    window.addEventListener('blur', () => {
        activeKeyboardPointerIds.clear();
        syncKeyboardTouchState();
        releaseAllActiveChords();
        resetModifierKeys();
    });

    tonicToggleEl.addEventListener('click', () => {
        const shouldOpen = tonicEditorEl.hidden;
        setSliderEditorOpen('tonic', shouldOpen);
    });

    octaveToggleEl.addEventListener('click', () => {
        const shouldOpen = octaveEditorEl.hidden;
        setSliderEditorOpen('octave', shouldOpen);
    });

    inversionToggleEl.addEventListener('click', () => {
        const shouldOpen = inversionEditorEl.hidden;
        setSliderEditorOpen('inversion', shouldOpen);
    });

    voiceToggleEl.addEventListener('click', () => {
        const shouldOpen = voiceEditorEl.hidden;
        setSliderEditorOpen('voice', shouldOpen);
    });

    tonicRangeEl.addEventListener('input', () => {
        setSelectValue(tonicSelect, tonicRangeEl.value);
    });

    octaveRangeEl.addEventListener('input', () => {
        const nextValue = octaveValues[Number(octaveRangeEl.value)];
        setSelectValue(octaveSelect, nextValue);
    });

    inversionRangeEl.addEventListener('input', () => {
        const nextValue = inversionValues[Number(inversionRangeEl.value)];
        setSelectValue(inversionSelect, nextValue);
    });

    tonicSelect.addEventListener('change', () => {
        updateTonicUI();
    });

    octaveSelect.addEventListener('change', () => {
        updateOctaveUI();
    });

    inversionSelect.addEventListener('change', () => {
        updateInversionUI();
    });

    voiceSelect.addEventListener('change', () => {
        updateVoiceUI();
        void preloadVoice(voiceSelect.value, { announce: activeSet.size === 0 });
    });

    [tonicSelect, octaveSelect, inversionSelect, voiceSelect].forEach(control => {
        control.addEventListener('change', async () => {
            if (activeSet.size > 0) {
                await replayActiveChords();
            }
        });
    });

    // 页面加载完成后的初始化
    document.addEventListener('DOMContentLoaded', () => {
        buildSliderScale(
            tonicScaleEl,
            noteNames.map((name, index) => ({ value: index, label: name, index })),
            value => setSelectValue(tonicSelect, value)
        );
        buildSliderScale(octaveScaleEl, octaveValues.map((value, index) => ({
            value: index,
            label: octaveChoiceMeta[String(value)].mark,
            index
        })), index => setSelectValue(octaveSelect, octaveValues[index]));
        buildSliderScale(inversionScaleEl, inversionValues.map((value, index) => ({
            value: index,
            label: inversionChoiceMeta[String(value)].mark,
            index
        })), index => setSelectValue(inversionSelect, inversionValues[index]));
        buildVoiceOptions();
        updateTonicUI();
        updateOctaveUI();
        updateInversionUI();
        updateVoiceUI();

        // 创建键盘可视化
        createKeyboardVisualization();
        createPianoVisualization();
        handleViewportLayoutChange();
        window.addEventListener('resize', handleViewportLayoutChange);
        
        // 更新状态提示
        updateIdleStatusMessage();
        void preloadVoice(voiceSelect.value, { announce: true });
        
        // 添加页面点击激活音频
        document.addEventListener('click', async () => {
            if (!hasUnlockedAudio) {
                await initAudio();
                updateIdleStatusMessage();
            }
        }, { once: true });
        
        // 检查 soundfont 是否加载
        const checkSoundfont = setInterval(() => {
            if (typeof Soundfont !== 'undefined') {
                soundfontAvailable = true;
                void preloadVoice(voiceSelect.value, { announce: true });
                console.log('Soundfont-player 已加载');
                clearInterval(checkSoundfont);
            }
        }, 100);
        
        // 10秒后停止检查
        setTimeout(() => clearInterval(checkSoundfont), 10000);
        
        console.log('ChordKeyboard 已加载。按 1-7 或 Q/Y 等键演奏和弦');
    });

    keyboardEl.addEventListener('contextmenu', ev => {
        ev.preventDefault();
    });

    keyboardEl.addEventListener('selectstart', ev => {
        ev.preventDefault();
    });

    keyboardEl.addEventListener('dragstart', ev => {
        ev.preventDefault();
    });

    document.addEventListener('click', (ev) => {
        if (ev.target.closest('.control-slider')) return;
        closeSliderEditors();
    });

    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            closeSliderEditors();
        }
    });
})();
