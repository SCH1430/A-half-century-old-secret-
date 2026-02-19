// ============================================
// PROJECT 1430 - GAME APPLICATION
// Interactive narrative about G.V. Kisunko
// ============================================

// CSS теперь подключается из styles.css (без инъекции через JavaScript)

window.addEventListener('DOMContentLoaded', () => {

    // Stable viewport unit for mobile browsers (prevents 100vh jumps when address bar shows/hides)
    const setVhUnit = () => {
        document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
    };
    setVhUnit();
    window.addEventListener('resize', setVhUnit);
    window.addEventListener('orientationchange', setVhUnit);

    // Глобальные горячие клавиши (помогает на защите): справка, Esc и т.п.
    initGlobalShortcuts();

    // Справка/управление (кнопка ❔ и клавиши H / ?)
    initHelpOverlay();

    const title = document.getElementById('titleTypewriter');
    const introTypewriter = typeWriter(title, 'ПРОЕКТ ПОЛУВЕКОВОЙ СЕКРЕТ', 150);
    initIntroSkip(introTypewriter);

    // Восстанавливаем настройки звука (localStorage)
    SoundManager.loadSettings();

    // Компактная панель звука: по умолчанию свернута и раскрывается по нажатию.
    initSoundPanel();

    // «Читать далее» для исторических фактов в полигоне
    initFactReadMore();

    // Загружаем базу исторических фактов (facts.json) при наличии
    HistoricalFactsDB.loadFromJson();

    // Загружаем справочник терминов квеста (glossary.json) при наличии
    GlossaryDB.loadFromJson();

    // PWA (web app): service worker + install prompt
    initPWA();

    // Mobile sheet tabs for Defense mode (Towers / Fact)
    initDefenseSheetTabs();
    // Mobile sheet drag (snap heights)
    initDefenseSheetDrag();

    // Автопауза «Полигона» при сворачивании/переключении вкладки
    initVisibilityAutoPause();

    SoundManager.play('menu');
    initKeyboardNavigation();
    // Автосейв квеста: обновляем кнопку "Продолжить" в меню
    updateQuestMenuButtons();
});


// =============================================
// PWA (Progressive Web App)
// - Service Worker (offline cache)
// - Install button (Android/desktop Chrome)
// =============================================
function initPWA(){
    // SW and install prompt require https (or localhost). On file:// it will not work — that's ok.
    const isSecure = (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]');
    // Service Worker registration + update UX
    if ('serviceWorker' in navigator && isSecure) {
        let updateRequested = false;
        let updateToastShown = false;

        const promptUpdate = (reg) => {
            if (!reg || updateToastShown) return;
            updateToastShown = true;

            showToastAction(
                '🔄 Доступно обновление приложения',
                'ОБНОВИТЬ',
                () => {
                    updateRequested = true;
                    try {
                        if (reg.waiting) {
                            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        } else {
                            // На всякий случай: если waiting нет — обычная перезагрузка
                            window.location.reload();
                        }
                    } catch (_) {
                        window.location.reload();
                    }
                },
                'info',
                9000,
                () => { updateToastShown = false; }
            );
        };

        const trackUpdates = (reg) => {
            if (!reg) return;
            // Если уже есть waiting воркер — обновление готово
            if (reg.waiting) promptUpdate(reg);

            reg.addEventListener('updatefound', () => {
                const worker = reg.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    // installed + есть controller => это обновление (не первая установка)
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        promptUpdate(reg);
                    }
                });
            });
        };

        navigator.serviceWorker.register('./service-worker.js')
            .then((reg) => {
                trackUpdates(reg);
            })
            .catch(() => {
                // ignore registration errors
            });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // Перезагружаем страницу только если пользователь нажал «ОБНОВИТЬ»
            if (updateRequested) {
                updateRequested = false;
                window.location.reload();
            }
        });
    }

    const installBtn = document.getElementById('installBtn');
    if (!installBtn) return;

    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Chrome/Edge (Android/Desktop)
        e.preventDefault();
        deferredPrompt = e;
        installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
        // iOS Safari doesn't support beforeinstallprompt
        if (!deferredPrompt) {
            showToast('📲 Установка: меню браузера → «На экран Домой»', 'info');
            return;
        }

        deferredPrompt.prompt();
        try {
            await deferredPrompt.userChoice;
        } catch (_) {
            // ignore
        }
        deferredPrompt = null;
        installBtn.classList.add('hidden');
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        installBtn.classList.add('hidden');
        showToast('✅ Приложение установлено', 'success');
    });
}


// =============================================
// UX: Автопауза «Полигона» при сворачивании приложения
// =============================================
let _visibilityAutoPauseInited = false;

function initVisibilityAutoPause(){
    if (_visibilityAutoPauseInited) return;
    _visibilityAutoPauseInited = true;

    const pauseIfNeeded = () => {
        if (!gameState || gameState.mode !== 'defense') return;
        if (gameState.paused) return;
        gameState.paused = true;
        gameState._pausedByVisibility = true;
        updateDefenseControlButtons();
    };

    const notifyIfAutoPaused = () => {
        if (!gameState || gameState.mode !== 'defense') return;
        if (!gameState._pausedByVisibility) return;
        gameState._pausedByVisibility = false;
        showToast('⏸ Пауза: приложение было свернуто', 'info');
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseIfNeeded();
        else notifyIfAutoPaused();
    });

    // Некоторые браузеры/ПВА вызывают pagehide без visibilitychange
    window.addEventListener('pagehide', pauseIfNeeded);
    window.addEventListener('focus', () => {
        if (!document.hidden) notifyIfAutoPaused();
    }, { passive: true });
}


/**
 * Делает панель звука компактной: показывает только иконку,
 * а настройки раскрываются по нажатию.
 */


/**
 * Позволяет пропустить заставку (typewriter + задержку появления кнопок)
 * кликом или клавишей Enter/Space — удобно на защите.
 */
function initIntroSkip(typewriterController) {
    const loading = document.getElementById('loadingScreen');
    if (!loading) return;

    const menuButtons = document.getElementById('menuButtons');

    // Добавляем ненавязчивую подсказку (создаём динамически, чтобы не трогать HTML)
    let hint = document.getElementById('skipHint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'skipHint';
        hint.className = 'skip-hint';
        hint.textContent = '⏩ Нажмите Enter или кликните, чтобы пропустить';
        loading.appendChild(hint);

        // Появляется чуть позже, чтобы не отвлекать от эффекта печати
        setTimeout(() => {
            if (!loading.classList.contains('hidden')) {
                hint.classList.add('is-visible');
            }
        }, 1600);
    }

    const skip = () => {
        if (loading.classList.contains('hidden')) return;
        loading.classList.add('is-skipped');
        hint.classList.remove('is-visible');

        // Мгновенно допечатываем заголовок
        if (typewriterController && typeof typewriterController.finish === 'function') {
            typewriterController.finish();
        }

        // Снимаем задержки появления элементов (подстраховка)
        const subtitle = loading.querySelector('.subtitle-loading');
        if (subtitle) {
            subtitle.style.opacity = '1';
            subtitle.style.animation = 'none';
        }
        if (menuButtons) {
            menuButtons.style.opacity = '1';
            menuButtons.style.animation = 'none';
        }
    };

    // Клик по фону — пропуск. Клик по кнопке меню оставляем как есть.
    loading.addEventListener('click', (e) => {
        const isButton = e.target && e.target.closest && e.target.closest('button');
        if (isButton) return;
        skip();
    });

    // Enter/Space — пропуск
    document.addEventListener('keydown', (e) => {
        if (loading.classList.contains('hidden')) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            skip();
        }
    });
}
function initSoundPanel() {
    const controls = document.getElementById('soundControls') || document.querySelector('.sound-controls');
    if (!controls) return;

    const toggleBtn = document.getElementById('soundPanelToggle') || controls.querySelector('.sound-panel-toggle');
    const body = document.getElementById('soundPanelBody') || controls.querySelector('.sound-panel-body');

    // Если разметка старая — не ломаем, просто выходим.
    if (!toggleBtn || !body) return;

    // Свернуто по умолчанию
    controls.classList.remove('is-open');
    body.setAttribute('aria-hidden', 'true');

    const setOpen = (open) => {
        controls.classList.toggle('is-open', open);
        body.setAttribute('aria-hidden', open ? 'false' : 'true');
    };

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = controls.classList.contains('is-open');
        setOpen(!open);
    });

    // Клики внутри раскрытой панели не должны закрывать её
    body.addEventListener('click', (e) => e.stopPropagation());

    // Клик вне панели — сворачиваем
    document.addEventListener('click', (e) => {
        if (!controls.contains(e.target)) setOpen(false);
    });

    // Обновляем иконку в зависимости от состояния звука
    updateSoundPanelIcon();
    updateSoundToggleText();

    // Синхронизируем ползунок громкости с сохранённым значением
    const slider = controls.querySelector('.volume-slider');
    if (slider) {
        slider.value = String(Math.round(SoundManager.volume * 100));
        // Обновляем подпись (и ещё раз выставляем громкость на текущий трек)
        changeVolume(slider.value);
    }
}

function updateSoundPanelIcon() {
    const toggleBtn = document.getElementById('soundPanelToggle');
    if (!toggleBtn) return;
    // Важно: не перетираем SVG-иконку текстом.
    // Вместо этого переключаем класс — CSS сам покажет "слэш" для режима mute.
    const muted = !SoundManager.enabled;
    toggleBtn.classList.toggle('is-muted', muted);
    toggleBtn.setAttribute('data-muted', muted ? 'true' : 'false');
}

function updateSoundToggleText() {
    const btn = document.getElementById('soundBtn');
    if (!btn) return;
    btn.innerHTML = SoundManager.enabled ? '🔊 ЗВУК: ВКЛ' : '🔇 ЗВУК: ВЫКЛ';
    btn.setAttribute('aria-pressed', SoundManager.enabled ? 'true' : 'false');
}

// =============================================
// Help / Controls overlay + global shortcuts
// =============================================

let helpOverlayEl = null;
let helpLastFocus = null;

function isHelpOpen(){
    return !!(helpOverlayEl && helpOverlayEl.classList.contains('is-open'));
}

// Tutorial overlay появится на Stage‑5, но проверка нужна уже сейчас
function isDefenseTutorialOpen(){
    const el = document.getElementById('defenseTutorial');
    return !!(el && el.classList.contains('is-open'));
}

function isDefenseGameOverOpen(){
    const el = document.getElementById('defenseGameOver');
    return !!(el && el.classList.contains('is-open'));
}

function isAnyOverlayOpen(){
    const questOverlay = (typeof isQuestOverlayOpen === 'function' && isQuestOverlayOpen());
    return isHelpOpen() || isDefenseTutorialOpen() || isDefenseGameOverOpen() || questOverlay || (typeof isLightboxOpen === 'function' && isLightboxOpen());
}

function updateBodyScrollLock(){
    // Единая точка для блокировки скролла, чтобы оверлеи не конфликтовали
    const lock = isAnyOverlayOpen();
    document.body.classList.toggle('no-scroll', lock);
}

// =============================================
// Mode splash (сочный переход между режимами)
// =============================================

let modeSplashEl = null;
let modeSplashTimeoutId = null;

function ensureModeSplash(){
    if (modeSplashEl) return;

    modeSplashEl = document.createElement('div');
    modeSplashEl.id = 'modeSplash';
    modeSplashEl.className = 'mode-splash';
    modeSplashEl.setAttribute('aria-hidden', 'true');

    modeSplashEl.innerHTML = `
        <div class="mode-splash-inner">
            <div class="mode-splash-title" id="modeSplashTitle"></div>
            <div class="mode-splash-sub" id="modeSplashSub"></div>
        </div>
    `;

    document.body.appendChild(modeSplashEl);
}

function showModeSplash(title, subtitle = ''){
    // Если пользователь предпочитает минимум анимаций — не навязываем
    try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }
    } catch (_) {}

    ensureModeSplash();
    if (!modeSplashEl) return;

    const t = document.getElementById('modeSplashTitle');
    const s = document.getElementById('modeSplashSub');
    if (t) t.textContent = title;
    if (s) s.textContent = subtitle;

    modeSplashEl.setAttribute('aria-hidden', 'false');
    // Перезапускаем анимацию, если нажали несколько раз подряд
    modeSplashEl.classList.remove('is-show');
    void modeSplashEl.offsetWidth;
    modeSplashEl.classList.add('is-show');

    if (modeSplashTimeoutId) clearTimeout(modeSplashTimeoutId);
    modeSplashTimeoutId = setTimeout(() => {
        if (!modeSplashEl) return;
        modeSplashEl.classList.remove('is-show');
        modeSplashEl.setAttribute('aria-hidden', 'true');
    }, 560);
}

function ensureHelpOverlay(){
    if (helpOverlayEl) return;

    helpOverlayEl = document.createElement('div');
    helpOverlayEl.id = 'helpOverlay';
    helpOverlayEl.className = 'help-overlay';
    helpOverlayEl.setAttribute('aria-hidden', 'true');

    helpOverlayEl.innerHTML = `
        <div class="help-backdrop" data-action="close"></div>
        <div class="help-dialog" role="dialog" aria-modal="true" aria-label="Справка и управление">
            <div class="help-header">
                <div>
                    <div class="help-title">Справка</div>
                    <div class="help-subtitle">Горячие клавиши и быстрый старт</div>
                </div>
                <button type="button" class="help-close" data-action="close" aria-label="Закрыть">✕</button>
            </div>

            <div class="help-grid">
                <div class="help-card">
                    <h3>Общее</h3>
                    <ul>
                        <li><kbd>H</kbd> / <kbd>?</kbd> — открыть/закрыть справку</li>
                        <li><kbd>Esc</kbd> — вернуться в меню</li>
                        <li>На заставке: <kbd>Enter</kbd> или <kbd>Space</kbd> — пропустить</li>
                        <li>В меню: <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> — быстрый запуск режимов</li>
                        <li><kbd>Shift</kbd>+<kbd>R</kbd> — сброс автосейва квеста</li>
                    </ul>
                </div>
                <div class="help-card">
                    <h3>Квест</h3>
                    <ul>
                        <li><kbd>←</kbd> / <kbd>↑</kbd> — предыдущая сцена</li>
                        <li><kbd>→</kbd> / <kbd>↓</kbd> / <kbd>Enter</kbd> / <kbd>Space</kbd> — следующая</li>
                        <li><kbd>G</kbd> — главы, <kbd>L</kbd> — справочник, <kbd>A</kbd> — коллекция</li>
                        <li>Прогресс сохраняется автоматически — в меню появится «Продолжить»</li>
                    </ul>
                </div>
                <div class="help-card">
                    <h3>Полигон</h3>
                    <ul>
                        <li>Клик по карточке башни → наведите курсор → клик по полю = поставить</li>
                        <li><kbd>Esc</kbd> или ПКМ — отменить выбор башни</li>
                        <li>Клик по установленной башне — улучшение / продажа</li>
                        <li><kbd>P</kbd> — пауза, <kbd>X</kbd> — скорость ×2</li>
                        <li><kbd>N</kbd> — следующая волна (когда появилась кнопка)</li>
                        <li>«Читать далее» раскрывает исторический факт</li>
                    </ul>
                </div>
                <div class="help-card">
                    <h3>Галерея</h3>
                    <ul>
                        <li>Клик по фото — открыть просмотр</li>
                        <li><kbd>Esc</kbd> — закрыть просмотр</li>
                        <li><kbd>←</kbd>/<kbd>→</kbd> — листать в просмотре</li>
                    </ul>
                </div>
            </div>

            <div class="help-actions">
                <button type="button" class="help-action" id="helpShowTutorial" disabled>Показать обучение полигона</button>
                <button type="button" class="help-action" id="helpResetQuest">Сбросить прогресс квеста</button>
                <button type="button" class="help-action" data-action="close">Закрыть</button>
            </div>
        </div>
    `;

    document.body.appendChild(helpOverlayEl);

    helpOverlayEl.addEventListener('click', (e) => {
        const action = e.target && e.target.dataset ? e.target.dataset.action : null;
        if (action === 'close') {
            closeHelpOverlay();
        }
    });

    const tutBtn = helpOverlayEl.querySelector('#helpShowTutorial');
    if (tutBtn) {
        tutBtn.addEventListener('click', () => {
            // Обучение имеет смысл только в режиме полигона
            if (!gameState || gameState.mode !== 'defense') return;
            closeHelpOverlay();
            // Реальная реализация обучения появится в Stage‑5 (defense tutorial)
            if (typeof openDefenseTutorial === 'function') {
                openDefenseTutorial({ force: true });
            }
        });
    }
    const resetBtn = helpOverlayEl.querySelector('#helpResetQuest');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const had = !!(getQuestProgress() && getQuestProgress().sceneId != null);
            clearQuestProgress();
            showAlert(had ? '✅ Прогресс квеста сброшен' : 'ℹ️ Нет сохранения квеста');

            // Если мы прямо сейчас в квесте — начинаем заново (ожидаемое поведение)
            if (gameState && gameState.mode === 'quest') {
                closeHelpOverlay(true);
                startQuest();
            }
        });
    }
}

function initHelpOverlay(){
    ensureHelpOverlay();

    const btn = document.getElementById('helpBtn');
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHelpOverlay();
        });
    }
}

function openHelpOverlay(){
    ensureHelpOverlay();
    if (!helpOverlayEl) return;

    helpLastFocus = document.activeElement;

    // Подстраиваем доступность кнопки обучения полигона
    const tutBtn = helpOverlayEl.querySelector('#helpShowTutorial');
    if (tutBtn) {
        tutBtn.disabled = !(gameState && gameState.mode === 'defense');
    }
    const resetBtn = helpOverlayEl.querySelector('#helpResetQuest');
    if (resetBtn) {
        const has = !!(getQuestProgress() && getQuestProgress().sceneId != null);
        resetBtn.disabled = !has;
    }

    helpOverlayEl.setAttribute('aria-hidden', 'false');
    helpOverlayEl.classList.add('is-open');
    updateBodyScrollLock();

    const closeBtn = helpOverlayEl.querySelector('.help-close');
    if (closeBtn) closeBtn.focus();
}

function closeHelpOverlay(force = false){
    if (!helpOverlayEl) return;
    helpOverlayEl.setAttribute('aria-hidden', 'true');
    helpOverlayEl.classList.remove('is-open');
    updateBodyScrollLock();

    if (!force && helpLastFocus && typeof helpLastFocus.focus === 'function') {
        try { helpLastFocus.focus(); } catch (_) {}
    }
}

function toggleHelpOverlay(){
    if (isHelpOpen()) closeHelpOverlay();
    else openHelpOverlay();
}

function isHelpHotkey(e){
    // Учитываем русскую раскладку: H на клавиатуре часто даёт «р»
    const k = e.key;
    return k === 'h' || k === 'H' || k === 'р' || k === 'Р' || k === '?' || k === '/';
}

function isNextWaveHotkey(e){
    // N на русской раскладке — это «т»
    const k = e.key;
    return k === 'n' || k === 'N' || k === 'т' || k === 'Т';
}


function isPauseHotkey(e){
    // P на русской раскладке — это «з»
    const k = e.key;
    return k === 'p' || k === 'P' || k === 'з' || k === 'З';
}

function isSpeedHotkey(e){
    // X на русской раскладке — это «ч»
    const k = e.key;
    return k === 'x' || k === 'X' || k === 'ч' || k === 'Ч';
}

function initGlobalShortcuts(){
    if (initGlobalShortcuts._bound) return;
    initGlobalShortcuts._bound = true;

    document.addEventListener('keydown', (e) => {
        // 1) Если открыт какой-то модальный оверлей — приоритет ему
        if (isHelpOpen()) {
            if (e.key === 'Escape' || isHelpHotkey(e)) {
                e.preventDefault();
                closeHelpOverlay();
            }
            return;
        }

        if (isDefenseGameOverOpen()) {
            // Game over screen: Enter/Space = retry, Esc = menu
            const k = e.key;
            const isRetryKey = (k === 'Enter' || k === ' ' || k === 'r' || k === 'R' || k === 'к' || k === 'К');
            if (k === 'Escape') {
                e.preventDefault();
                handleDefenseGameOverAction('menu');
            } else if (isRetryKey) {
                e.preventDefault();
                handleDefenseGameOverAction('retry');
            }
            return;
        }

        if (isDefenseTutorialOpen()) {
            // Пока обучение открыто — закрываем его клавишами Esc/Enter/Space
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeDefenseTutorial({ complete: true, force: true });
            }
            return;
        }

        // Lightbox (галерея/квест): Esc закрывает, ←/→ листают
        if (typeof isLightboxOpen === 'function' && isLightboxOpen()) {
            const k = e.key;
            if (k === 'Escape') {
                e.preventDefault();
                closeLightbox();
                return;
            }
            if (k === 'ArrowLeft') {
                e.preventDefault();
                stepLightbox(-1);
                return;
            }
            if (k === 'ArrowRight') {
                e.preventDefault();
                stepLightbox(1);
                return;
            }
            return;
        }

        // Оверлеи квеста: Esc закрывает (а не выкидывает в меню)
        if (typeof isQuestOverlayOpen === 'function' && isQuestOverlayOpen()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeQuestOverlays();
            }
            return;
        }

        // 2) Открыть/закрыть справку
        if (isHelpHotkey(e)) {
            // Не мешаем вводу ползунка громкости
            const ae = document.activeElement;
            const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
            if (!typing) {
                e.preventDefault();
                toggleHelpOverlay();
                return;
            }
        }

        // 2.5) На заставке (в меню): быстрый запуск режимов — удобно на защите
        const introEl = document.getElementById('loadingScreen');
        const isOnIntro = introEl && !introEl.classList.contains('hidden');
        if (isOnIntro) {
            const ae = document.activeElement;
            const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
            if (!typing) {
                if (e.key === '1') {
                    e.preventDefault();
                    continueQuest();
                    return;
                }
                if (e.key === '2') {
                    e.preventDefault();
                    startDefense();
                    return;
                }
                if (e.key === '3') {
                    e.preventDefault();
                    startGallery();
                    return;
                }

                // Shift+R — сбросить автосейв квеста (только из меню, чтобы не нажать случайно)
                const isResetKey = (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К');
                if (isResetKey && e.shiftKey) {
                    e.preventDefault();
                    const had = !!(getQuestProgress() && getQuestProgress().sceneId != null);
                    clearQuestProgress();
                    showAlert(had ? '✅ Прогресс квеста сброшен' : 'ℹ️ Нет сохранения квеста');
                    return;
                }
            }
        }

        // 3) Быстрая клавиша следующей волны в полигоне
        if (gameState && gameState.mode === 'defense' && isNextWaveHotkey(e)) {
            const fact = document.getElementById('historicalFact');
            if (fact && !fact.classList.contains('hidden')) {
                e.preventDefault();
                nextWave();
                return;
            }
        }

        // 3.5) Пауза / скорость в полигоне (не мешаем вводам)
        if (gameState && gameState.mode === 'defense') {
            const ae = document.activeElement;
            const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
            if (!typing) {
                if (isPauseHotkey(e)) {
                    e.preventDefault();
                    toggleDefensePause();
                    return;
                }
                if (isSpeedHotkey(e)) {
                    e.preventDefault();
                    toggleDefenseSpeed();
                    return;
                }
            }
        }

        // 3.8) Квест: быстро открыть «Главы / Справочник»
        if (gameState && gameState.mode === 'quest' && !isAnyOverlayOpen()) {
            const ae = document.activeElement;
            const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
            if (!typing) {
                if (isQuestTocHotkey(e)) {
                    e.preventDefault();
                    toggleQuestToc();
                    return;
                }
                if (isQuestGlossaryHotkey(e)) {
                    e.preventDefault();
                    toggleQuestGlossary();
                    return;
                }
            }
        }

        // 4) Esc — закрыть выбор/панель (если есть), иначе вернуться в меню
        if (e.key === 'Escape') {
            const loading = document.getElementById('loadingScreen');
            const isOnIntro = loading && !loading.classList.contains('hidden');
            if (isOnIntro) return;

            // В полигоне Esc сначала отменяет действие (чтобы не вылетать из режима случайно)
            if (gameState && gameState.mode === 'defense') {
                if (gameState.selectedTower !== null) {
                    e.preventDefault();
                    clearPlacementSelection({ silent: true });
                    return;
                }
                if (gameState.selectedPlacedTower != null) {
                    e.preventDefault();
                    closeTowerActions();
                    return;
                }
            }

            if (gameState && gameState.mode) {
                e.preventDefault();
                returnToMenu();
            }
        }
    }, true);
}

// =============================================
// Defense tutorial overlay (первый запуск)
// =============================================

const DEFENSE_TUTORIAL_KEY = 'p1430_defense_tutorial_seen';
let defenseTutorialEl = null;
let defenseTutorialLastFocus = null;
let defenseTutorialOnDone = null;

function hasSeenDefenseTutorial(){
    try {
        return localStorage.getItem(DEFENSE_TUTORIAL_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function markDefenseTutorialSeen(){
    try {
        localStorage.setItem(DEFENSE_TUTORIAL_KEY, '1');
    } catch (_) {
        // ignore
    }
}

function setDefenseTutorialHighlight(on){
    const panel = document.getElementById('towerPanel');
    const canvas = document.getElementById('gameCanvas');
    if (panel) panel.classList.toggle('tutorial-highlight', !!on);
    if (canvas) canvas.classList.toggle('tutorial-highlight', !!on);
}

function ensureDefenseTutorial(){
    if (defenseTutorialEl) return;

    defenseTutorialEl = document.createElement('div');
    defenseTutorialEl.id = 'defenseTutorial';
    defenseTutorialEl.className = 'tutorial-overlay';
    defenseTutorialEl.setAttribute('aria-hidden', 'true');

    defenseTutorialEl.innerHTML = `
        <div class="tutorial-backdrop" data-action="close"></div>
        <div class="tutorial-card" role="dialog" aria-modal="true" aria-label="Обучение полигону">
            <div class="tutorial-header">
                <div>
                    <div class="tutorial-title">Быстрый старт: Полигон</div>
                    <div class="tutorial-subtitle">30 секунд — и вы готовы показывать проект на защите</div>
                </div>
                <button type="button" class="tutorial-close" data-action="close" aria-label="Закрыть">✕</button>
            </div>

            <ol class="tutorial-steps">
                <li><strong>Выберите башню</strong> в панели справа (карточка подсветится).</li>
                <li><strong>Кликните по полю</strong>, чтобы установить башню.</li>
                <li>Башни нельзя ставить слишком близко — появится предупреждение.</li>
                <li>Типы целей: <strong>⚡</strong> быстрые, <strong>🛡</strong> бронированные, <strong>☄️</strong> босс каждая 5‑я волна.</li>
                <li>После волны появится исторический факт и кнопка <strong>«Следующая волна»</strong>.
                    Можно нажать <kbd>N</kbd>.</li>
            </ol>

            <div class="tutorial-actions">
                <button type="button" class="menu-btn tutorial-ok" data-action="ok">Понятно, поехали!</button>
            </div>
        </div>
    `;

    document.body.appendChild(defenseTutorialEl);

    defenseTutorialEl.addEventListener('click', (e) => {
        const action = e.target && e.target.dataset ? e.target.dataset.action : null;
        if (!action) return;
        if (action === 'close') {
            // Закрытие = продолжить (обучение только мешает игре)
            closeDefenseTutorial({ complete: true });
        }
        if (action === 'ok') {
            closeDefenseTutorial({ complete: true });
        }
    });
}

function openDefenseTutorial(options = {}){
    const { onDone, force = false } = options;
    if (!gameState || gameState.mode !== 'defense') return;

    if (!force && hasSeenDefenseTutorial()) {
        if (typeof onDone === 'function') onDone();
        return;
    }

    ensureDefenseTutorial();
    if (!defenseTutorialEl) return;

    defenseTutorialLastFocus = document.activeElement;
    defenseTutorialOnDone = (typeof onDone === 'function') ? onDone : null;

    defenseTutorialEl.setAttribute('aria-hidden', 'false');
    defenseTutorialEl.classList.add('is-open');
    setDefenseTutorialHighlight(true);
    updateBodyScrollLock();

    // Фокус на кнопке OK — удобно с клавиатуры
    const ok = defenseTutorialEl.querySelector('[data-action="ok"]');
    if (ok) ok.focus();
}

function closeDefenseTutorial(options = {}){
    const { complete = false, force = false } = options;
    if (!defenseTutorialEl || !isDefenseTutorialOpen()) {
        // Даже если элемента ещё нет — всё равно можем завершить волну
        if (complete && typeof defenseTutorialOnDone === 'function') {
            defenseTutorialOnDone();
            defenseTutorialOnDone = null;
        }
        return;
    }

    defenseTutorialEl.setAttribute('aria-hidden', 'true');
    defenseTutorialEl.classList.remove('is-open');
    setDefenseTutorialHighlight(false);
    updateBodyScrollLock();

    // Показываем один раз — дальше можно открыть из справки
    markDefenseTutorialSeen();

    if (complete && typeof defenseTutorialOnDone === 'function') {
        defenseTutorialOnDone();
        defenseTutorialOnDone = null;
    }

    if (!force && defenseTutorialLastFocus && typeof defenseTutorialLastFocus.focus === 'function') {
        try { defenseTutorialLastFocus.focus(); } catch (_) {}
    }
}

// =============================================
// Defense: Game Over screen (Stage-13)
// - Показывает статистику забега
// - Обновляет локальный рекорд
// =============================================

let defenseGameOverEl = null;
let defenseGameOverLastFocus = null;

function ensureDefenseGameOverOverlay(){
    if (defenseGameOverEl) return;

    defenseGameOverEl = document.createElement('div');
    defenseGameOverEl.id = 'defenseGameOver';
    defenseGameOverEl.className = 'tutorial-overlay';
    defenseGameOverEl.setAttribute('aria-hidden', 'true');

    defenseGameOverEl.innerHTML = `
        <div class="tutorial-backdrop" data-action="menu"></div>
        <div class="tutorial-card gameover-card" role="dialog" aria-modal="true" aria-label="Результаты полигона">
            <div class="tutorial-header">
                <div>
                    <div class="tutorial-title" id="goTitle">ПОЛИГОН ЗАХВАЧЕН</div>
                    <div class="tutorial-subtitle" id="goSub">Итоги попытки</div>
                </div>
                <button type="button" class="tutorial-close" data-action="menu" aria-label="Закрыть">✕</button>
            </div>

            <div class="gameover-grid" aria-label="Статистика">
                <div class="gameover-stat"><span>Пройдены волны</span><b id="goWaves">0</b></div>
                <div class="gameover-stat"><span>Текущая волна</span><b id="goWaveNow">0</b></div>
                <div class="gameover-stat"><span>Уничтожено целей</span><b id="goKills">0</b></div>
                <div class="gameover-stat"><span>Прорывов</span><b id="goLeaks">0</b></div>
                <div class="gameover-stat"><span>Счёт</span><b id="goScore">0</b></div>
                <div class="gameover-stat"><span>Время</span><b id="goTime">0:00</b></div>
            </div>

            <div class="gameover-record is-hidden" id="goRecord"></div>

            <div class="tutorial-actions">
                <button type="button" class="menu-btn menu-btn-secondary" data-action="retry">ЕЩЁ РАЗ</button>
                <button type="button" class="menu-btn" data-action="menu">В МЕНЮ</button>
            </div>
        </div>
    `;

    defenseGameOverEl.addEventListener('click', (e) => {
        const action = e.target && e.target.dataset ? e.target.dataset.action : null;
        if (!action) return;
        handleDefenseGameOverAction(action);
    });

    document.body.appendChild(defenseGameOverEl);
}

function isDefenseGameOverElementOpen(){
    return !!(defenseGameOverEl && defenseGameOverEl.classList.contains('is-open'));
}

function formatDuration(sec){
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${m}:${ss}`;
}

function openDefenseGameOver(payload = {}){
    ensureDefenseGameOverOverlay();
    if (!defenseGameOverEl) return;

    defenseGameOverLastFocus = document.activeElement;

    const { run, record, score, isNewRecord, durationSec } = payload;

    const wavesCompleted = Math.max(0, Number(run && run.wavesCompleted) || 0);
    const waveNow = Math.max(1, Number(payload.waveNow) || Number(run && run.waveNow) || (gameState ? gameState.wave : 1));
    const kills = Math.max(0, Number(run && run.kills) || 0);
    const leaks = Math.max(0, Number(run && run.leaks) || 0);

    const setText = (id, v) => {
        const el = defenseGameOverEl.querySelector(`#${id}`);
        if (el) el.textContent = String(v);
    };

    setText('goWaves', wavesCompleted);
    setText('goWaveNow', waveNow);
    setText('goKills', kills);
    setText('goLeaks', leaks);
    setText('goScore', Math.max(0, Number(score) || 0));
    setText('goTime', formatDuration(durationSec || 0));

    const recEl = defenseGameOverEl.querySelector('#goRecord');
    if (recEl) {
        const bestW = record ? (record.bestWaves || 0) : 0;
        const bestK = record ? (record.bestKills || 0) : 0;
        const bestS = record ? (record.bestScore || 0) : 0;

        if (isNewRecord) {
            recEl.classList.remove('is-hidden');
            recEl.textContent = `🏆 Новый рекорд! Счёт: ${bestS} • Волны: ${bestW} • Цели: ${bestK}`;
        } else {
            recEl.classList.remove('is-hidden');
            recEl.textContent = `Рекорд: ${bestS} • Волны: ${bestW} • Цели: ${bestK}`;
        }
    }

    defenseGameOverEl.setAttribute('aria-hidden', 'false');
    defenseGameOverEl.classList.add('is-open');
    updateBodyScrollLock();

    const retryBtn = defenseGameOverEl.querySelector('[data-action="retry"]');
    if (retryBtn) retryBtn.focus();
}

function closeDefenseGameOver(options = {}){
    const { force = false } = options;
    if (!defenseGameOverEl || !isDefenseGameOverElementOpen()) return;

    defenseGameOverEl.setAttribute('aria-hidden', 'true');
    defenseGameOverEl.classList.remove('is-open');
    updateBodyScrollLock();

    if (!force && defenseGameOverLastFocus && typeof defenseGameOverLastFocus.focus === 'function') {
        try { defenseGameOverLastFocus.focus(); } catch (_) {}
    }
}

function handleDefenseGameOverAction(action){
    // Закрываем оверлей (форсируем, чтобы не возвращать фокус на «мертвую» сцену)
    closeDefenseGameOver({ force: true });

    if (action === 'retry') {
        startDefense();
        return;
    }
    // close/backdrop/menu
    returnToMenu();
}

function triggerDefenseGameOver(){
    if (!gameState || gameState.mode !== 'defense') return;
    if (gameState._isGameOver) return;

    gameState._isGameOver = true;
    gameState.paused = true;
    updateDefenseControlButtons();

    // Собираем статистику забега
    const now = Date.now();
    const run = gameState.runStats || { startedAt: now, kills: 0, leaks: 0, wavesCompleted: 0 };
    const durationSec = Math.round((now - (run.startedAt || now)) / 1000);

    // На всякий случай: если волна завершалась, но статистика не успела — фиксируем
    run.wavesCompleted = Math.max(0, Number(run.wavesCompleted) || 0);

    run.waveNow = gameState.wave;

    const upd = updateDefenseRecordIfNeeded(run);

    // Показываем экран
    openDefenseGameOver({
        run,
        record: upd.record,
        score: upd.score,
        isNewRecord: upd.isNew,
        durationSec,
        waveNow: gameState.wave
    });
}

// Sound Manager
const SoundManager = {
    // Выключаем звук по умолчанию, так как в офлайн-версии могут отсутствовать mp3-файлы.
    enabled: false,
    volume: 0.5,
    currentTrack: null,

    storageKeys: {
        enabled: 'p1430_sound_enabled',
        volume: 'p1430_sound_volume'
    },

    loadSettings: function() {
        try {
            const en = localStorage.getItem(this.storageKeys.enabled);
            if (en !== null) this.enabled = (en === '1');
            const vol = localStorage.getItem(this.storageKeys.volume);
            if (vol !== null) {
                const v = parseFloat(vol);
                if (!Number.isNaN(v)) {
                    this.volume = Math.max(0, Math.min(1, v));
                }
            }
        } catch (_) {
            // localStorage может быть недоступен в некоторых окружениях
        }
    },

    saveSettings: function() {
        try {
            localStorage.setItem(this.storageKeys.enabled, this.enabled ? '1' : '0');
            localStorage.setItem(this.storageKeys.volume, String(this.volume));
        } catch (_) {
            // ignore
        }
    },

    config: {
        menu: 'musik/menu.mp3',
        quest: 'musik/quest.mp3',
        defense: 'musik/defense.mp3'
    },

    play: function(trackName) {
        if (!this.enabled || !this.config[trackName]) return;

        if (this.currentTrack) {
            this.currentTrack.pause();
        }

        this.currentTrack = new Audio(this.config[trackName]);
        this.currentTrack.volume = this.volume;
        this.currentTrack.loop = true;
        this.currentTrack.play().catch(e => console.log('Audio play failed:', e));
    },

    stop: function() {
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }
    },

    setVolume: function(vol) {
        this.volume = vol / 100;
        if (this.currentTrack) {
            this.currentTrack.volume = this.volume;
        }
        this.saveSettings();
    }
};

// Typewriter Effect
function typeWriter(element, text, speed = 100, callback) {
    let i = 0;
    let cancelled = false;
    element.textContent = '';

    function type() {
        if (cancelled) return;

        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        } else if (callback) {
            callback();
        }
    }

    type();

    // Контроллер для ускоренного завершения (используется для "пропуска" заставки)
    return {
        finish: () => {
            if (cancelled) return;
            cancelled = true;
            element.textContent = text;
            if (callback) callback();
        },
        cancel: () => {
            cancelled = true;
        }
    };
}

// Quest Data
// Список сцен наполняется:
// 1) из scenes.json (если страница запущена через http/https),
// 2) либо используется встроенный локальный набор ниже (fallback для офлайн/file://).
let questScenes = [];

const finalScreen = {
    title: 'ПРОЕКТ ЗАВЕРШЁН',
    content: `Проект «ПОЛУВЕКОВОЙ СЕКРЕТ» завершен. Ты много узнал о Г.В. Кисунько и теперь можешь рассказать другим об этом удивительном человеке.<br><br>Его жизнь - это пример беззаветного служения Отечеству, научного гения и человеческого мужества.<br><br><strong class="final-accent">Спасибо за прохождение Проекта ПОЛУВЕКОВОЙ СЕКРЕТ!</strong>`,
    // Локальная картинка — проект должен стабильно работать офлайн
    photo: 'img/kisunko_teacher.jpg',
    photoCaption: 'Фото: Г.В. Кисунько (портрет)'
};

// --- Встроенные локальные сцены ---
// Перезаписываем questScenes локальными данными, чтобы заменить внешние изображения на локальные
// и корректно менять фотографии между сценами. Эта структура соответствует содержимому scenes.json.
questScenes = [
  {
    "id": 1,
    "title": "СЦЕНА 1: ЗАПУСК АРХИВА",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Добро пожаловать в проект \"ПОЛУВЕКОВОЙ СЕКРЕТ\". Ты - школьник и тебе поручили узнать правду о человеке, оружие которого \"попало в муху в космосе\". Готов начать исследование?"
      },
      {
        "speaker": "student",
        "text": "Звучит круто! А кто этот человек?"
      },
      {
        "speaker": "archive",
        "text": "Григорий Васильевич Кисунько - советский учёный и генеральный конструктор первой отечественной системы противоракетной обороны."
      }
    ],
    "buttonText": "Да, запускай архив.",
    "photo": "img/15Кисунько Г.В. (1918-1998).jpg",
    "photoCaption": "Фото: Генерал-лейтенант Кисунько Г.В.",
    "next": 2,
    "year": "АРХИВ",
    "place": "Проект 1430",
    "glossaryUnlock": [
      "kisunko"
    ],
    "sources": [
      {
        "title": "Фото: Генерал-лейтенант Кисунько Г.В",
        "url": "https://ibb.co/j9QyVc9J"
      },
      {
        "title": "Г.В. Кисунько — «Секретная зона: Исповедь генерального конструктора» (мемуары)",
        "url": ""
      }
    ]},
  {
    "id": 2,
    "title": "СЦЕНА 2: РОЖДЕНИЕ И ПРОИСХОЖДЕНИЕ",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Запись первая. 20 июля 1918 года в селе Бельманка Запорожской области в крестьянской семье рождается мальчик Гриша."
      },
      {
        "speaker": "archive",
        "text": "В 1938 году семью раскулачивают, а отца по ложному доносу арестовывают и расстреливают как \"врага народа\"."
      },
      {
        "speaker": "student",
        "text": "Как он вообще мог учиться после такого?"
      },
      {
        "speaker": "archive",
        "text": "Учился. Да ещё как!"
      }
    ],
    "buttonText": "Как он вообще смог?",
    "photo": "img/2Отчий дом.jpg",
    "photoCaption": "Фото: Отчий дом",
    "next": 3,
    "year": 1918,
    "place": "Бельманка (Запорожская обл.)",
    "glossaryUnlock": [],
    "sources": [
      {
        "title": "Фото: Отчий дом Григория Кисунько",
        "url": "https://ibb.co/kVpQdmvY"
      }
    ]
  },
  {
    "id": 3,
    "title": "СЦЕНА 3: УЧЁБА В ВОРОШИЛОВГРАДСКОМ ПЕДИНСТИТУТЕ",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Сначала Григорий обучается на физико-математическом факультете Ворошиловградского педагогического института, который заканчивает в 1938 году с отличием."
      },
      {
        "speaker": "student",
        "text": "С таким бэкграундом семьи - это просто подвиг!"
      },
      {
        "speaker": "archive",
        "text": "Скорее всего упорство и вера в себя."
      }
    ],
    "buttonText": "Далее в аспирантуру?",
    "photo": "img/3Ворошиловградский пединститут.jpg",
    "photoCaption": "Фото:Ворошиловградский пединститут",
    "next": 4,
    "year": 1938,
    "place": "Луганск",
    "glossaryUnlock": [],
    "sources": [
      {
        "title": "Фото:Ворошиловградский пединститут",
        "url": "https://ibb.co/S4N0XgQ0"
      }
    ]},
  {
    "id": 4,
    "title": "СЦЕНА 4: АСПИРАНТУРА И ЗАЩИТА",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Далее Григорий Васильевич продолжает учебу в аспирантуре Ленинградского пединститута на кафедре теоретической физики."
      },
      {
        "speaker": "archive",
        "text": "А 17 июня 1941 года защищает диссертацию и становится кандидатом физико-математических наук."
      },
      {
        "speaker": "student",
        "text": "Защититься за четыре дня до войны?! Во судьба!"
      },
      {
        "speaker": "archive",
        "text": "Да. За четыре дня до войны. Но его знания теоретической физики вскоре очень пригодятся."
      }
    ],
    "buttonText": "Что же дальше?",
    "photo": "img/4Кисунько Г.В. - аспирант.jpg",
    "photoCaption": "Кисунько Г.В.- аспирант",
    "next": 5,
    "year": 1941,
    "place": "Ленинград",
    "glossaryUnlock": [],
    "sources": [
      {
        "title": "РГПУ им. А. И. Герцена (справка)",
        "url": "https://herzen.spb.ru/"
      },
      {
        "title": "Фото: Кисунько Г.В. - аспирант",
        "url": "https://ibb.co/VcwK924K"
      }
    ]},
  {
    "id": 5,
    "title": "СЦЕНА 5: ДОБРОВОЛЕЦ ОПОЛЧЕНИЯ",
    "dialog": [
      {
        "speaker": "archive",
        "text": "1941 год. Война. Он не прячется в лаборатории, хотя мог уехать с семьей в глубокий тыл по распределению."
      },
      {
        "speaker": "archive",
        "text": "Он записывается добровольцем в Ленинградскую Армию Народного ополчения. Звание — рядовой."
      },
      {
        "speaker": "student",
        "text": "Учёный и  на фронт?"
      },
      {
        "speaker": "archive",
        "text": "Иначе Григорий Васильевич поступить не мог. Позже он напишет семье, что долг защитить Родину был для него превыше всего."
      }
    ],
    "buttonText": "Куда его направят?",
    "photo": "img/5Кисунько Г.В. - рядовой ополчения.jpg",
    "photoCaption": "Фото:Кисунько Г.В. - рядовой ополчения",
    "next": 6,
    "year": 1941,
    "place": "Ленинград",
    "glossaryUnlock": [],
    "sources": [
      {
        "title": "Википедия: Народное ополчение (СССР)",
        "url": "https://ru.wikipedia.org/wiki/Народное_ополчение"
      },
      {
        "title": "Фото:Кисунько Г.В. - рядовой ополчения",
        "url": "https://ibb.co/zhn6fLgq"
      }
    ]
  },
  {
    "id": 6,
    "title": "СЦЕНА 6: ВОЕННОЕ УЧИЛИЩЕ ВНОС",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Вскоре из ополчения был направлен на учебу в Военное училище Воздушного наблюдения, оповещения и связи (ВНОС)."
      },
      {
        "speaker": "archive",
        "text": "Февраль 1942. Учится ловить вражеские самолеты радиолокатором."
      },
      {
        "speaker": "student",
        "text": "Радары в 1942? Уже были?"
      },
      {
        "speaker": "archive",
        "text": "Да, советские радиолокаторы, достаточно простые, но свои задачи решали."
      }
    ],
    "buttonText": "И стал офицером?",
    "photo": "img/6Кисунько Г.В.- курсант ВНОС.jpg",
    "photoCaption": "Фото: Кисунько Г.В.- курсант ВНОС",
    "next": 7,
    "year": 1942,
    "place": "Училище ВНОС",
    "glossaryUnlock": [
      "vnos",
      "rls"
    ],
    "sources": [
      {
        "title": "Фото: Кисунько Г.В.- курсант ВНОС",
        "url": "https://ibb.co/0RztwPPk"
      },
      {
        "title": "Фото: Кисунько Г.В.- курсант ВНОС",
        "url": "https://ibb.co/0RztwPPk"
      }
    ]},
  {
    "id": 7,
    "title": "СЦЕНА 7: КОМАНДИР ВЗВОДА, 337-Й БАТАЛЬОН ПВО",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Февраль 1942. Лейтенант Кисунько командует взводом личного состава радиолокационной станции."
      },
      {
        "speaker": "archive",
        "text": "337-й Отдельный радиобатальон ВНОС Особой Московской армии ПВО."
      },
      {
        "speaker": "archive",
        "text": "Он отвечает за радары, защищающие Москву от авиации Люфтваффе. Лейтенант Кисунько служит на одной из трёх радиолокационных станций слежения, подаренных английским премьер-министром Уинстоном Черчиллем лично Сталину."
      },
      {
        "speaker": "student",
        "text": "Значит, его работа помогала защищать столицу?"
      },
      {
        "speaker": "archive",
        "text": "Безусловно. Каждый день. Каждую ночь налётов."
      }
    ],
    "buttonText": "Что было дальше?",
    "photo": "img/7Кисунько Г.В. - командир взвода.jpg",
    "photoCaption": "Фото: Кисунько Г.В. - командир взвода",
    "next": 8,
    "year": 1942,
    "place": "Москва (ПВО)",
    "glossaryUnlock": [
      "pvo"
    ],
    "sources": [
      {
        "title": "Фото: Кисунько Г.В. - командир взвода",
        "url": "https://ibb.co/sdJdhSjP"
      },
      {
        "title": "Википедия: Радиолокация",
        "url": "https://ru.wikipedia.org/wiki/Радиолокация"
      }
    ]},
  {
    "id": 8,
    "title": "СЦЕНА 8: ПРЕПОДАВАТЕЛЬ ВОЕННОЙ АКАДЕМИИ",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Конец войны. Его переводят преподавателем в Военную академию связи имени Будённого."
      },
      {
        "speaker": "archive",
        "text": "Декабрь 1944 года. Он обучает офицеров теории радиолокации."
      },
      {
        "speaker": "archive",
        "text": "Заместитель начальника кафедры. Его лекции — база для будущих инженеров-радиотехников."
      },
      {
        "speaker": "student",
        "text": "С фронта и сразу на кафедру?"
      },
      {
        "speaker": "archive",
        "text": "По приказу И.В. Сталина! Его знания были нужнее в аудитории. Он готовил новое поколение защитников Отечества."
      }
    ],
    "buttonText": "Идём дальше",
    "photo": "img/8Военная академия связи им. С.М. Буденного.jpg",
    "photoCaption": "Фото:Военная академия связи им. С. М. Будённого (Ленинград)",
    "next": 9,
    "year": 1944,
    "place": "Ленинград",
    "glossaryUnlock": [],
    "sources": [
      {
        "title": "Военная академия связи имени С. М. Будённого",
        "url": "https://ibb.co/kVRDrkv9"
      }
    ]},
  {
    "id": 9,
    "title": "СЦЕНА 9: ПЕРЕХОД В КБ-1",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Октябрь 1950 — КБ-1. Специальное конструкторское бюро под Москвой."
      },
      {
        "speaker": "archive",
        "text": "Начальник сектора. Затем начальник отдела разработки радиотехнических систем."
      },
      {
        "speaker": "student",
        "text": "То есть, он переходит в оружейники?"
      },
      {
        "speaker": "archive",
        "text": "Не в оружейники — в разработчики оборонительного вооружения. Ракеты против вражеских ракет."
      }
    ],
    "buttonText": "Какие ракеты?",
    "photo": "img/9Кисунько Г.В. - КБ-1.webp",
    "photoCaption": "Фото: Кисунько Г.В. - КБ-1",
    "next": 10,
    "year": 1950,
    "place": "КБ‑1 (Подмосковье)",
    "glossaryUnlock": [
      "kb1"
    ],
    "sources": [
      {
        "title": "Фото: Кисунько Г.В. - КБ-1",
        "url": "https://ibb.co/tpjNj1Hh"
      },
      {
        "title": "Википедия: НПО «Алмаз»",
        "url": "https://ru.wikipedia.org/wiki/НПО_Алмаз"
      }
    ]},
  {
    "id": 10,
    "title": "СЦЕНА 10: ЗЕНИТНЫЕ СИСТЕМЫ «С-25» и «С-75»",
    "dialog": [
      {
        "speaker": "archive",
        "text": "«С‑25» (Беркут) — первая советская зенитно‑ракетная система, рассчитанная на одновременный налёт тысячи самолётов."
      },
      {
        "speaker": "archive",
        "text": "Вокруг Москвы создаётся кольцо их позиций. Защита столицы от американских бомбардировщиков."
      },
      {
        "speaker": "archive",
        "text": "«С‑75» — ещё более совершенный мобильный зенитно‑ракетный комплекс, развёртывается по всей территории СССР."
      },
      {
        "speaker": "student",
        "text": "Советский щит над столицей?"
      },
      {
        "speaker": "archive",
        "text": "Именно. Первый настоящий щит противосамолётной обороны."
      }
    ],
    "photo": "img/10Система С-25 С ЗРК Беркут.jpg",
    "photoCaption": "Фото: Система С-25 С ЗРК Беркут",
    "choices": [
      {
        "text": "Узнать о награждении",
        "next": 11
      },
      {
        "text": "Перейти к созданию системы ‘А’",
        "next": 12
      }
    ],
    "year": 1955,
    "place": "Москва (ПВО)",
    "glossaryUnlock": [
      "s25",
      "s75"
    ],
    "sources": [
      {
        "title": "Фото: Система С-25 С ЗРК Беркут",
        "url": "https://ibb.co/35vcJXwf"
      }
    ]},
  {
    "id": 11,
    "title": "СЦЕНА 11: ГЕРОЙ СОЦИАЛИСТИЧЕСКОГО ТРУДА",
    "dialog": [
      {
        "speaker": "archive",
        "text": "1956 год. За разработку системы С‑25 Григорий Васильевич удостоен звания Героя Социалистического Труда."
      },
      {
        "speaker": "archive",
        "text": "Это высшая трудовая награда СССР."
      },
      {
        "speaker": "student",
        "text": "То есть, советский аналог Нобеля? Это уже вершина карьеры?"
      },
      {
        "speaker": "archive",
        "text": "Для многих — да. Но для него — начало пути в бессмертие!"
      }
    ],
    "buttonText": "Что дальше?",
    "photo": "img/11Золотая медаль «Серп и Молот» Героя Социалистического Труда.jpg",
    "photoCaption": "Фото: Золотая медаль «Серп и Молот» Героя Социалистического Труда",
    "next": 12,
    "year": 1956,
    "place": "СССР",
    "glossaryUnlock": [
      "hero"
    ],
    "sources": [
      {
        "title": "Фото: Золотая медаль «Серп и Молот» Героя Социалистического Труда",
        "url": "https://ibb.co/5g3dYNG6"
      }
    ]},
  {
    "id": 12,
    "title": "СЦЕНА 12: СИСТЕМА ‘А’ — НОВОЕ ЗАДАНИЕ",
    "dialog": [
      {
        "speaker": "archive",
        "text": "3 февраля 1956 года. Постановление ЦК КПСС и Совета Министров СССР."
      },
      {
        "speaker": "archive",
        "text": "Создание экспериментального комплекса противоракетной обороны — Системы ‘А’."
      },
      {
        "speaker": "archive",
        "text": "Главный конструктор — Григорий Васильевич Кисунько."
      },
      {
        "speaker": "student",
        "text": "Противоракетной? Ракета против ракеты?"
      },
      {
        "speaker": "archive",
        "text": "Да. Впервые в мире. Никто никогда этого не делал."
      }
    ],
    "buttonText": "Дальше…",
    "photo": "img/12Система А - экспериментальный комплекс.jpg",
    "photoCaption": "Фото: Система 'А' - экспериментальный комплекс",
    "next": 13,
    "year": 1956,
    "place": "СССР",
    "glossaryUnlock": [
      "pro",
      "system_a"
    ],
    "sources": [
      {
        "title": "Фото: Система 'А' - экспериментальный комплекс",
        "url": "https://ibb.co/Kx9G8Xgw"
      }
    ]},
  {
    "id": 13,
    "title": "СЦЕНА 13: МЕДАЛЬ ЛЕНИНСКОЙ ПРЕМИИ:",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Полигон Сары-Шаган, 4 марта 1961 года – День который изменил историю."
      },
      {
        "speaker": "archive",
        "text": "Кисунько Г.В - Лауреат Ленинской премии СССР,1966 год, за работы по созданию Системы «А». "
      },
      {
        "speaker": "student",
        "text": "Ленинская премия, что это?"
      },
      {
        "speaker": "archive",
        "text": "Ленинская премия – высшая форма поощрения граждан за выдающиеся достижения."
      }
    ],
    "buttonText": "Финал?",
    "photo": "img/15Медаль Лауреата Ленинской премии.png",
    "photoCaption": "Фото: Медаль Лауреата Ленинской премии",
    "next": 14,
    "year": 1961,
    "place": "Сары‑Шаган",
    "glossaryUnlock": [
      "saryshagan",
      "v1000"
    ],
    "sources": [
      {
        "title": "Фото: Медаль Лауреата Ленинской премии",
        "url": "https://ibb.co/FL4B7qy5"
      }
    ]},
  {
    "id": 14,
    "title": "СЦЕНА 14: НАСЛЕДИЕ И ПАМЯТЬ",
    "dialog": [
      {
        "speaker": "archive",
        "text": "Григорий Васильевич создал основу для будущих поколений противоракетных систем: А‑35, А‑135 и далее."
      },
      {
        "speaker": "archive",
        "text": "Его работы позволили защитить небо над Москвой и всей страной."
      },
      {
        "speaker": "student",
        "text": "Вот это история!"
      },
      {
        "speaker": "archive",
        "text": "Теперь ты знаешь, как ‘попасть в муху в космосе’."
      }
    ],
    "buttonText": "Вернуться в меню",
    "photo": "img/14музейный экспонат - памятник создателям ПРО.jpg",
    "photoCaption": "Фото: музейный экспонат - памятник создателям ПРО",
    "next": null,
    "year": 1972,
    "place": "Москва (ПРО)",
    "glossaryUnlock": [
      "a35",
      "a135",
      "don2n"
    ],
    "sources": [
      {
        "title": "Фото: музейный экспонат - памятник создателям ПРО",
        "url": "https://ibb.co/pBpmJQBz"
      }
    ]}
];




// Tower Defense Data - обновленные названия
// =============================================
// Defense: Balance (Stage-14)
// Вынесено в JSON для удобного баланса без правок кода:
// - towers.json: башни (статы/апгрейды/эффекты/приоритет)
// - waves.json: волны (кривая сложности/экономика/типы целей)
// При отсутствии файлов используются DEFAULT_*.
// =============================================

const DEFAULT_TOWER_TYPES = [
    {
        name: 'РЛС "ДУНАЙ-2"',
        range: 280,
        damage: 15,
        firerate: 1.0,
        cost: 600,
        color: '#C9B07A',
        icon: '📡',
        description: 'Мощная РЛС дальнего обнаружения',
        history: 'Дальность обнаружения >1000 км, цифровая ЭВМ 40 тыс. операций/сек',
        targetingDefault: 'first',
        upgrade: { rangeStep: 0.12, damageStep: 0.35, firerateStep: 0.18 }
    },
    {
        name: 'РЛС НАВЕДЕНИЯ',
        range: 180,
        damage: 30,
        firerate: 2.2,
        cost: 400,
        color: '#D8C3A5',
        icon: '🎯',
        description: 'Точное сопровождение целей',
        history: 'Обеспечивал точное наведение противоракет',
        targetingDefault: 'nearest',
        upgrade: { rangeStep: 0.12, damageStep: 0.35, firerateStep: 0.18 },
        // Спецэффект (Stage-14): замедление цели при попадании
        effects: {
            slow: { mult: 0.75, durationMs: 900, scale: { multStep: -0.05, durationStep: 200 } }
        }
    },
    {
        name: 'ПУ В-1000',
        range: 120,
        damage: 65,
        firerate: 0.4,
        cost: 500,
        color: '#8C4A3B',
        icon: '🚀',
        description: 'Пусковая установка противоракет',
        history: 'Противоракета системы "А" (П.Д. Грушин)',
        targetingDefault: 'strongest',
        upgrade: { rangeStep: 0.10, damageStep: 0.42, firerateStep: 0.14 }
    }
];

let towerTypes = DEFAULT_TOWER_TYPES;

const DEFAULT_DEFENSE_BALANCE = {
    economy: {
        startHealth: 100,
        startResources: 1500,
        upgradeCostMul: { to2: 0.6, to3: 0.9 },
        sellRefundMul: 0.7
    },
    wave: {
        baseEnemies: 3,
        enemiesPerWave: 2,
        bossEvery: 5,
        bossCount: 1,
        spawnEveryMs: 780,
        bossDelayMs: 1100
    },
    scaling: {
        baseSpeed: 1.2,
        speedPerWave: 0.15,
        baseHealth: 60,
        healthPerWave: 12
    },
    chances: {
        fast: { base: 0.10, perWave: 0.02, cap: 0.35 },
        armored: { startWave: 4, base: 0.05, perWave: 0.02, cap: 0.30 }
    }
};

let DEFENSE_BALANCE = DEFAULT_DEFENSE_BALANCE;

function mergeDeep(target, src) {
    // простое "глубокое" объединение для объектов баланса
    const out = { ...(target || {}) };
    if (!src || typeof src !== 'object') return out;
    for (const k of Object.keys(src)) {
        const v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            out[k] = mergeDeep(out[k], v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function normalizeTowerTypes(raw) {
    if (!Array.isArray(raw)) return null;
    const cleaned = [];
    for (const t of raw) {
        if (!t || typeof t !== 'object') continue;
        if (typeof t.name !== 'string' || !t.name.trim()) continue;
        cleaned.push({
            ...t,
            // минимальная страховка типов
            range: Number(t.range),
            damage: Number(t.damage),
            firerate: Number(t.firerate),
            cost: Number(t.cost),
            color: String(t.color || '#C9B07A'),
            icon: String(t.icon || '🏰'),
            targetingDefault: String(t.targetingDefault || 'nearest')
        });
    }
    return cleaned.length ? cleaned : null;
}

function normalizeDefenseBalance(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw;
    // Возвращаем только то, что нам нужно; остальное проигнорируем
    const out = {};
    if (b.economy && typeof b.economy === 'object') out.economy = b.economy;
    if (b.wave && typeof b.wave === 'object') out.wave = b.wave;
    if (b.scaling && typeof b.scaling === 'object') out.scaling = b.scaling;
    if (b.chances && typeof b.chances === 'object') out.chances = b.chances;
    if (b.archetypes && typeof b.archetypes === 'object') out.archetypes = b.archetypes;
    return out;
}

let _defenseBalanceLoaded = false;
let _defenseBalancePromise = null;

async function loadDefenseBalance() {
    if (_defenseBalanceLoaded) return;
    if (_defenseBalancePromise) return _defenseBalancePromise;

    _defenseBalancePromise = (async () => {
        // file:// часто блокирует fetch. В этом режиме используем дефолты.
        if (location.protocol === 'file:') {
            _defenseBalanceLoaded = true;
            return;
        }

        const fetchJson = async (path) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
            return res.json();
        };

        try {
            const [tRes, wRes] = await Promise.allSettled([
                fetchJson('towers.json'),
                fetchJson('waves.json')
            ]);

            if (tRes.status === 'fulfilled') {
                const tt = normalizeTowerTypes(tRes.value);
                if (tt) towerTypes = tt;
            }

            if (wRes.status === 'fulfilled') {
                const wb = normalizeDefenseBalance(wRes.value);
                if (wb) {
                    DEFENSE_BALANCE = mergeDeep(DEFAULT_DEFENSE_BALANCE, wb);
                    if (wb.archetypes) ENEMY_ARCHETYPES = wb.archetypes;
                }
            }
        } catch (e) {
            console.warn('Defense balance load failed:', e);
        } finally {
            _defenseBalanceLoaded = true;
        }
    })();

    return _defenseBalancePromise;
}

// =============================================
// Defense: Enemy archetypes (Stage-13)
// 3 типа целей + босс (каждая 5-я волна)
// =============================================

const DEFAULT_ENEMY_ARCHETYPES = {
    standard: {
        name: 'Стандартная цель',
        icon: '●',
        color: '#B86B5F',
        speedMul: 1.00,
        hpMul: 1.00,
        dmgMul: 1.00,
        reward: 75,
        leakDamage: 15,
        size: 12
    },
    fast: {
        name: 'Быстрая цель',
        icon: '⚡',
        color: '#47D7FF',
        speedMul: 1.45,
        hpMul: 0.75,
        dmgMul: 1.00,
        reward: 60,
        leakDamage: 12,
        size: 10
    },
    armored: {
        name: 'Бронированная цель',
        icon: '🛡',
        color: '#FFA500',
        speedMul: 0.85,
        hpMul: 1.75,
        dmgMul: 0.75,
        reward: 110,
        leakDamage: 18,
        size: 13
    },
    boss: {
        name: 'Босс',
        icon: '☄️',
        color: '#B45CFF',
        speedMul: 0.70,
        hpMul: 4.20,
        baseHp: 260,
        hpPerWave: 28,
        dmgMul: 0.65,
        reward: 350,
        leakDamage: 35,
        size: 18,
        isBoss: true
    }
};

let ENEMY_ARCHETYPES = DEFAULT_ENEMY_ARCHETYPES;

function computeEnemyStats(kind, wave){
    const sc = (DEFENSE_BALANCE && DEFENSE_BALANCE.scaling) ? DEFENSE_BALANCE.scaling : DEFAULT_DEFENSE_BALANCE.scaling;

    const baseSpeed = (Number(sc.baseSpeed) || 1.2) + wave * (Number(sc.speedPerWave) || 0.15);
    const baseHealth = (Number(sc.baseHealth) || 60) + wave * (Number(sc.healthPerWave) || 12);

    const cfg = ENEMY_ARCHETYPES[kind] || ENEMY_ARCHETYPES.standard;

    let health = baseHealth * (cfg.hpMul || 1);
    if (cfg.baseHp) health += cfg.baseHp + (cfg.hpPerWave || 0) * wave;

    return {
        kind,
        name: cfg.name,
        icon: cfg.icon,
        color: cfg.color,
        speed: +(baseSpeed * (cfg.speedMul || 1)).toFixed(3),
        health: Math.max(10, Math.round(health)),
        reward: Math.max(0, cfg.reward || 0),
        leakDamage: Math.max(1, cfg.leakDamage || 15),
        dmgMul: (typeof cfg.dmgMul === 'number') ? cfg.dmgMul : 1,
        size: Math.max(8, cfg.size || 12),
        isBoss: !!cfg.isBoss
    };
}

function pickEnemyKindForWave(wave){
    const ch = (DEFENSE_BALANCE && DEFENSE_BALANCE.chances) ? DEFENSE_BALANCE.chances : DEFAULT_DEFENSE_BALANCE.chances;

    const fastCfg = ch.fast || {};
    const armoredCfg = ch.armored || {};

    const fastBase = Number(fastCfg.base);
    const fastPer = Number(fastCfg.perWave);
    const fastCap = Number(fastCfg.cap);

    const fastChance = Math.min(
        Number.isFinite(fastCap) ? fastCap : 0.35,
        (Number.isFinite(fastBase) ? fastBase : 0.10) + wave * (Number.isFinite(fastPer) ? fastPer : 0.02)
    );

    const armoredStart = Number(armoredCfg.startWave);
    const armoredBase = Number(armoredCfg.base);
    const armoredPer = Number(armoredCfg.perWave);
    const armoredCap = Number(armoredCfg.cap);

    const startWave = Number.isFinite(armoredStart) ? armoredStart : 4;

    const armoredChance = (wave >= startWave)
        ? Math.min(
            Number.isFinite(armoredCap) ? armoredCap : 0.30,
            (Number.isFinite(armoredBase) ? armoredBase : 0.05) + (wave - (startWave - 1)) * (Number.isFinite(armoredPer) ? armoredPer : 0.02)
        )
        : 0;

    const r = Math.random();
    if (r < armoredChance) return 'armored';
    if (r < armoredChance + fastChance) return 'fast';
    return 'standard';
}

// =============================================
// Defense: Records (Stage-13)
// Рекорд хранится в localStorage и показывается на экране поражения
// =============================================

const DEFENSE_RECORD_KEY = 'p1430_defense_record_v1';

function loadDefenseRecord(){
    try{
        const raw = localStorage.getItem(DEFENSE_RECORD_KEY);
        if (!raw) return { bestWaves: 0, bestKills: 0, bestScore: 0 };
        const obj = JSON.parse(raw);
        return {
            bestWaves: Math.max(0, Number(obj.bestWaves) || 0),
            bestKills: Math.max(0, Number(obj.bestKills) || 0),
            bestScore: Math.max(0, Number(obj.bestScore) || 0),
            updatedAt: obj.updatedAt || null
        };
    }catch(_){
        return { bestWaves: 0, bestKills: 0, bestScore: 0 };
    }
}

function saveDefenseRecord(rec){
    try{
        localStorage.setItem(DEFENSE_RECORD_KEY, JSON.stringify(rec));
    }catch(_){
        // ignore
    }
}

function computeDefenseScore(run){
    const waves = Math.max(0, Number(run.wavesCompleted) || 0);
    const kills = Math.max(0, Number(run.kills) || 0);
    const leaks = Math.max(0, Number(run.leaks) || 0);
    // Небольшая формула «смысла»: волны важнее, но убийства тоже ценятся.
    return Math.max(0, Math.round(waves * 1000 + kills * 40 - leaks * 120));
}

function updateDefenseRecordIfNeeded(run){
    const rec = loadDefenseRecord();
    const score = computeDefenseScore(run);

    const isNew = score > (rec.bestScore || 0);
    if (isNew){
        const next = {
            bestWaves: Math.max(rec.bestWaves || 0, Number(run.wavesCompleted) || 0),
            bestKills: Math.max(rec.bestKills || 0, Number(run.kills) || 0),
            bestScore: score,
            updatedAt: new Date().toISOString()
        };
        saveDefenseRecord(next);
        return { record: next, isNew: true, score };
    }

    // Даже если счёт не лучше, обновим «лучшие волны/киллы» на всякий случай.
    const updated = {
        bestWaves: Math.max(rec.bestWaves || 0, Number(run.wavesCompleted) || 0),
        bestKills: Math.max(rec.bestKills || 0, Number(run.kills) || 0),
        bestScore: Math.max(rec.bestScore || 0, score),
        updatedAt: rec.updatedAt || null
    };
    if (
        updated.bestWaves !== rec.bestWaves ||
        updated.bestKills !== rec.bestKills ||
        updated.bestScore !== rec.bestScore
    ){
        saveDefenseRecord(updated);
    }
    return { record: updated, isNew: false, score };
}

// =============================================
// Historical facts (Defense mode)
// База фактов + «эффект новизны»:
// - факты не повторяются, пока не покажутся все
// - прогресс сохраняется между новыми играми (localStorage)
// - при наличии facts.json можно обновлять базу без правки app.js
// =============================================

const FACTS_VERSION = 'v1';

const DEFAULT_HISTORICAL_FACTS = [
    { id: 'intercept-1961', title: 'ФАКТ: ПЕРВЫЙ ПЕРЕХВАТ', content: '4 марта 1961 года на полигоне Сары-Шаган экспериментальный комплекс ПРО Система «А» впервые в мире перехватил боеголовку баллистической ракеты на траектории полета.' },
    { id: 'system-a-1956', title: 'ФАКТ: СТАРТ ПРОЕКТА «А»', content: 'Работы по Системе «А» развернулись во второй половине XX века на полигоне Сары-Шаган. Это был первый советский экспериментальный комплекс стратегической ПРО' },
    { id: 'saryshagan-1956', title: 'ФАКТ: ПОЛИГОН САРЫ‑ШАГАН', content: 'Сары‑Шаган — испытательный полигон ПРО в Казахстане на берегу озера Балхаш. Он был создан в 1956 году и до сих пор используется для испытаний ракет и радиолокации.' },
    { id: 'saryshagan-scale', title: 'ФАКТ: МАСШТАБЫ ПОЛИГОНА', content: 'Испытательный Балхашский полигон занимал 75 тыс. км² и включал большую трассу полёта целей и противоракет.' },
    { id: 'kapustin-distance', title: 'ФАКТ: ТРАССА С КАПУСТИНА ЯРА', content: 'Сары-Шаган расположен примерно в 1600 км от Капустина Яра, поэтому он подходил для приёма целей, запускаемых с другого полигона' },
    { id: 'dunay2-1958', title: 'ФАКТ: РЛС «ДУНАЙ‑2»', content: 'РЛС дальнего обнаружения «Дунай-2» была ключевым элементом Системы «А». Уже 6 августа 1958 года она впервые обнаружила в полёте баллистическую ракету Р-5 на расстоянии около 25 км.' },
    { id: 'dunay2-1500', title: 'ФАКТ: ДАЛЬНОСТЬ ОБНАРУЖЕНИЯ', content: '4 марта 1961 года РЛС «Дунай-2» обнаружила ракету Р-12 на дальности до 1000 км (это давало системе время на расчёт перехвата), сбила на дальности 78 км и высоте 25 км.' },
    { id: 'm40-computer', title: 'ФАКТ: ЭВМ М‑40 — «МОЗГ» ПЕРЕХВАТА', content: 'Наведение в Системе «А» считала управляющая ЭВМ М-40, она управляла РЛС сопровождения и выдавалa команды на противоракету. В марте 1961 М-40 участвовала в испытании с уничтожением боеголовки.' },
    { id: 'm40-real-time', title: 'ФАКТ: КОМПЬЮТЕР РЕАЛЬНОГО ВРЕМЕНИ', content: '«М-40» создавали специально для задач ПРО. Это был один из ранних примеров вычислительной системы реального времени для управления сложным объектом.' },
    { id: 'v1000-missile', title: 'ФАКТ: ПРОТИВОРАКЕТА В‑1000', content: '«В1000» - противоракета, которую использовали в испытаниях Системы «А». Именно она применялась в перехвате 4 марта 1961 года.' },
    { id: 'abm-treaty-1972', title: 'ФАКТ: ДОГОВОР ПО ПРО (1972)', content: 'Договор об ограничении систем ПРО был подписан в Москве 26 мая 1972 года США и СССР. 13 декабря 2001 года США в одностороннем порядке вышли из Договора, после чего, согласно положениям договора, он сохранял силу ещё в течение 6 месяцев, до 12 июня 2002 года.' },
    { id: 'abm-protocol-1974', title: 'ФАКТ: ПРОТОКОЛ 1974 ГОДА', content: 'В 1974 году к договору по ПРО был подписан протокол между СССР и США, который сократил разрешённое число районов развёртывания ПРО до одного у каждой стороны.' },
    { id: 'a35-1972', title: 'ФАКТ: СИСТЕМА «А35» — ПРО МОСКВЫ', content: 'Система «А-35» - советская система ПРО, развернутая вокруг Москвы. Она была поставлена на боевое дежурство в 1977 году, и столица нашей Родины обрела надежную защиту.' },
    { id: 'a35-a350', title: 'ФАКТ: ПРОТИВОРАКЕТЫ «А‑350»', content: 'В составе Системы «А-35» использовались противоракеты «А-350» с ядерным боезарядом (перехват вне атмосферы)' },
    { id: 'a135-1995', title: 'ФАКТ: СИСТЕМЫ «А135» — ПРЕЕМНИК  «А35»', content: 'Система «А-135» - система противоракетной обороны (защиты) города Москвы. Она была принята на вооружение в 1996 году.' },
    { id: 'don2n-role', title: 'ФАКТ: РАДАР «ДОН 2-Н»', content: 'Многофункциональный радар «ДОН‑2Н» — ключевой элемент Системы «А‑135». Он обеспечивает круговой обзор 360° и сопровождение целей для наведения противоракет.' },
    { id: 'don2n-location', title: 'ФАКТ: ГДЕ НАХОДИТСЯ «ДОН 2-Н»', content: '«ДОН-2Н» расположен в районе Софрино Московской области, рядом с основными объектами московской ПРО.' },
    { id: 'don2n-timeline', title: 'ФАКТ: СТРОИТЕЛЬСТВО «ДОН-2Н»', content: 'Строительство РЛС «ДОН-2Н» началось в 1978 году. В 1989 году станция была принята на вооружение, а в 1996 году поставлена на боевое дежурство.' },
    { id: 'kisunko-chiefdesigner', title: 'ФАКТ: КИСУНЬКО — ГЕНЕРАЛЬНЫЙ КОНСТРУКТОР', content: 'Г.В. Кисунько был генеральным конструктором Системы «А» (с 1956 года), а затем руководил созданием московской ПРО Системы «А-35».' },
    { id: 'lenin-prize-1966', title: 'ФАКТ: ЛЕНИНСКАЯ ПРЕМИЯ(1966)', content: 'В 1966 году Г.В. Кисунько получил Ленинскую премию за работы по созданию Системы «А» и связанные с ними исследования.' },
    { id: 'hero-1956', title: 'ФАКТ: ГЕРОЙ СОЦИАЛИСТИЧЕСКОГО ТРУДА', content: 'В 1956 году Кисунько Г.В. получил звание Героя Социалистического Труда за разработку Системы С-25 («Беркут»).' },
    { id: 'secret-zone-book', title: 'ФАКТ: «СЕКРЕТНАЯ ЗОНА»', content: 'В 1996 году Кисунько Г.В. написал автобиографическую книгу «Секретная зона» - одну из самых известных книг о становлении советской ПРО.' },
    { id: 'satellite-tracking', title: 'ФАКТ: РАДАРЫ И СПУТНИКИ', content: 'Во время работ по Системе «А» радиолокаторы использовали не только для ракет. В 1958 году один из локаторов впервые провёл локацию советского спутника (ИСЗ‑3).' },
    { id: 'nuclear-tests-1961-62', title: 'ФАКТ: ВЫСОТНЫЕ ИСПЫТАНИЯ 1961–1962', content: 'В 1961–1962 годах в районе полигона Сары-Шаган проводились высоковысотные ядерные испытания серии «К» (взрывы на высотах десятки и сотни километров).' },
    { id: 'site-awards', title: 'ФАКТ: НАГРАДЫ ПОЛИГОНА', content: 'За вклад в разработку новой техники полигон Сары-Шаган был награждён орденом Ленина (1966) и орденом Красной Звезды (1981).' },
    { id: 'abm-withdrawal-2002', title: 'ФАКТ: КОНЕЦ ДОГОВОРА ПО ПРО', content: '3 декабря 2001 года США объявили о своем одностороннем выходе из Договора по противоракетной обороне "ПРО", подписанного Москвой и Вашингтоном в 1972 году, который, по их мнению, "не отвечал реалиям сегодняшнего дня".' },
    { id: 'saryshagan-active-2022', title: 'ФАКТ: ПОЛИГОН ДЕЙСТВУЕТ', content: 'Сары-Шаган остаётся действующим испытательным полигоном. В открытых источниках упоминаются пуски и в 2020е годы.' }
];

let historicalFacts = DEFAULT_HISTORICAL_FACTS.slice();

const HistoricalFactsDB = (() => {
    const POOL_KEY = `kis_hfacts_pool_${FACTS_VERSION}`;
    const IDX_KEY  = `kis_hfacts_idx_${FACTS_VERSION}`;
    const LAST_KEY = `kis_hfacts_last_${FACTS_VERSION}`;

    let list = historicalFacts;
    let map = new Map(list.map(f => [f.id, f]));

    const safeJson = (v, fallback) => {
        try { return JSON.parse(v); } catch (_) { return fallback; }
    };

    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const normalizeList = (arr) => {
        if (!Array.isArray(arr)) return [];
        const out = [];
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const id = String(item.id || '').trim();
            const title = String(item.title || '').trim();
            const content = String(item.content || '').trim();
            if (!id || !title || !content) continue;
            out.push({ id, title, content });
        }
        // Уникальные id
        const seen = new Set();
        return out.filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true)));
    };

    const savePool = (pool, idx) => {
        try {
            localStorage.setItem(POOL_KEY, JSON.stringify(pool));
            localStorage.setItem(IDX_KEY, String(idx));
        } catch (_) {}
    };

    const ensurePool = (force = false) => {
        const ids = list.map(f => f.id);

        // Если localStorage недоступен — просто вернём «одноразовый» пул
        if (!window.localStorage) {
            return { pool: ids.slice(), idx: 0 };
        }

        let pool = safeJson(localStorage.getItem(POOL_KEY), null);
        let idx = parseInt(localStorage.getItem(IDX_KEY) || '0', 10);
        if (!Number.isFinite(idx) || idx < 0) idx = 0;

        const poolOk =
            Array.isArray(pool) &&
            pool.length === ids.length &&
            new Set(pool).size === pool.length &&
            pool.every(id => map.has(id));

        if (force || !poolOk) {
            pool = shuffle(ids.slice());
            idx = 0;
            savePool(pool, idx);
        }

        // Закончились факты → новая перетасовка (без повтора подряд)
        if (idx >= pool.length) {
            const last = localStorage.getItem(LAST_KEY);
            pool = shuffle(ids.slice());

            if (last && pool.length > 1 && pool[0] === last) {
                const k = 1 + Math.floor(Math.random() * (pool.length - 1));
                [pool[0], pool[k]] = [pool[k], pool[0]];
            }

            idx = 0;
            savePool(pool, idx);
        }

        return { pool, idx };
    };

    const setList = (arr) => {
        const normalized = normalizeList(arr);
        list = normalized.length ? normalized : DEFAULT_HISTORICAL_FACTS.slice();
        historicalFacts = list;
        map = new Map(list.map(f => [f.id, f]));
        ensurePool(true);
    };

    const next = () => {
        if (!list || !list.length) setList(DEFAULT_HISTORICAL_FACTS);

        // Без localStorage (редко) — просто случайный факт
        if (!window.localStorage) {
            return list[Math.floor(Math.random() * list.length)];
        }

        const { pool, idx } = ensurePool(false);
        const id = pool[idx];

        try {
            localStorage.setItem(LAST_KEY, id);
            localStorage.setItem(IDX_KEY, String(idx + 1));
        } catch (_) {}

        return map.get(id) || list[0];
    };

    const reset = () => {
        try {
            localStorage.removeItem(POOL_KEY);
            localStorage.removeItem(IDX_KEY);
            localStorage.removeItem(LAST_KEY);
        } catch (_) {}
    };

    const loadFromJson = async () => {
        try {
            // file:// часто блокирует fetch, поэтому грузим только на http(s)
            if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

            const res = await fetch('facts.json', { cache: 'no-store' });
            if (!res.ok) return;

            const data = await res.json();
            if (Array.isArray(data)) setList(data);
        } catch (_) {
            // fallback остаётся DEFAULT_HISTORICAL_FACTS
        }
    };

    return { next, reset, setList, loadFromJson };
})();


// =============================================
// Glossary DB (quest terms) — glossary.json + fallback
// =============================================

const DEFAULT_GLOSSARY = [
    {
        id: 'kisunko',
        term: 'Г.В. Кисунько',
        definition: 'Григорий Васильевич Кисунько (1918–1998) — советский учёный и инженер, один из ключевых создателей отечественной противоракетной обороны. В проекте вы проходите его путь через учебу, войну и работу над системами ПВО/ПРО.'
    },
    {
        id: 'pvo',
        term: 'ПВО',
        definition: 'ПВО — противовоздушная оборона: комплекс сил и средств для защиты территории и объектов от воздушного нападения (самолёты, крылатые ракеты и т.п.).'
    },
    {
        id: 'rls',
        term: 'РЛС',
        definition: 'РЛС — радиолокационная станция (радар). Обнаруживает объекты по отражённому радиосигналу и помогает определять их координаты.'
    },
    {
        id: 'vnos',
        term: 'ВНОС',
        definition: 'ВНОС — воздушное наблюдение, оповещение и связь. Во время войны такие подразделения обеспечивали обнаружение воздушных целей и передачу информации в системы ПВО.'
    },
    {
        id: 'kb1',
        term: 'КБ‑1',
        definition: 'КБ‑1 — специальное конструкторское бюро (Москва/Подмосковье), где разрабатывали радиотехнические и зенитно‑ракетные системы. Позже направления работ были связаны с НПО «Алмаз». '
    },
    {
        id: 's25',
        term: 'С‑25 «Беркут»',
        definition: 'С‑25 — первая советская зенитно‑ракетная система для обороны Москвы, построенная как кольцо позиций вокруг столицы.'
    },
    {
        id: 's75',
        term: 'С‑75',
        definition: 'С‑75 — советский мобильный зенитно‑ракетный комплекс, который широко применялся для противовоздушной обороны страны.'
    },
    {
        id: 'hero',
        term: 'Герой Социалистического Труда',
        definition: 'Одна из высших наград СССР за трудовые заслуги. Звание сопровождалось медалью «Серп и Молот».'
    },
    {
        id: 'pro',
        term: 'ПРО',
        definition: 'ПРО — противоракетная оборона: системы, предназначенные для обнаружения и перехвата баллистических ракет (или их боевых блоков).'
    },
    {
        id: 'system_a',
        term: 'Система «А»',
        definition: 'Экспериментальный комплекс ПРО в СССР (1950–60‑е), созданный для отработки принципов перехвата баллистических целей.'
    },
    {
        id: 'v1000',
        term: 'В‑1000',
        definition: 'В‑1000 — ракета‑перехватчик, применявшаяся в испытаниях комплекса ПРО «Система А». '
    },
    {
        id: 'saryshagan',
        term: 'Сары‑Шаган',
        definition: 'Испытательный полигон в районе озера Балхаш, где проводились испытания противоракетных комплексов, включая «Систему А». '
    },
    {
        id: 'a35',
        term: 'А‑35',
        definition: 'А‑35 — одна из первых отечественных систем ПРО для обороны района Москвы, созданная на базе наработок ранних экспериментов.'
    },
    {
        id: 'a135',
        term: 'А‑135',
        definition: 'А‑135 — система ПРО Москвы. Её важный элемент — радиолокационная станция Дон‑2Н с круговым обзором.'
    },
    {
        id: 'don2n',
        term: 'Дон‑2Н',
        definition: 'Дон‑2Н — многофункциональная РЛС кругового обзора, применяемая в системе ПРО Москвы для обнаружения и сопровождения целей.'
    }
];

const GlossaryDB = (() => {
    let list = Array.isArray(DEFAULT_GLOSSARY) ? [...DEFAULT_GLOSSARY] : [];
    let byId = new Map();

    const reindex = () => {
        byId = new Map();
        (list || []).forEach((it) => {
            if (!it || !it.id) return;
            byId.set(String(it.id), it);
        });
    };

    const setList = (arr) => {
        if (!Array.isArray(arr) || !arr.length) return;
        list = arr;
        reindex();
    };

    const all = () => (Array.isArray(list) ? list.slice() : []);
    const get = (id) => (id == null ? null : (byId.get(String(id)) || null));

    const loadFromJson = async () => {
        try {
            // file:// часто блокирует fetch, поэтому грузим только на http(s)
            if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

            const res = await fetch('glossary.json', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) setList(data);
        } catch (_) {
            // fallback остаётся DEFAULT_GLOSSARY
        }
    };

    reindex();
    return { all, get, setList, loadFromJson };
})();

// Game State
let gameState = {
    mode: null,
    currentChapter: 0,
    health: 100,
    resources: 1500,
    wave: 1,
    towers: [],
    enemies: [],
    // Визуальные эффекты (вспышки, маркеры, частицы) и снаряды/анимации выстрелов
    effects: [],
    projectiles: [],
    _lastFrameTime: 0,

    // Выбор типа башни для размещения и выбор уже установленной башни
    selectedTower: null,           // индекс типа башни для размещения
    selectedPlacedTower: null,     // индекс установленной башни (апгрейд/продажа)

    // Превью установки (ghost)
    pointer: { x: 0, y: 0, active: false },
    placement: { ok: false, reason: '' },

    // Управление темпом симуляции
    paused: false,
    timeScale: 1,
    defenseTime: 0,                // "внутренние" миллисекунды симуляции
    spawnQueue: [],

    gameLoop: null,
    enemiesRemaining: 0,
    enemiesTotal: 0,

    keyboardNavigation: true,

    // legacy: раньше использовалось для setTimeout-спавна
    spawnTimeouts: [],

    // Статистика текущей волны (для итоговой плашки)
    waveStats: null,
    waveSummaryShown: false
};

// =============================================
// Quest progress (autosave) — localStorage
// =============================================

const QUEST_PROGRESS_KEY = 'p1430_quest_progress_v1';

function getQuestProgress(){
    try {
        const raw = localStorage.getItem(QUEST_PROGRESS_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.sceneId == null) return null;
        return data;
    } catch (_) {
        return null;
    }
}

function formatQuestProgressNote(progress){
    if (!progress || progress.sceneId == null) return '';
    const id = progress.sceneId;
    const title = (progress.title || '').replace(/\s+/g,' ').trim();
    if (title) {
        const cleaned = title.replace(/^СЦЕНА\s*\d+\s*:\s*/i,'').trim();
        return `Сохранено: СЦЕНА ${id}${cleaned ? ' — ' + cleaned : ''}`;
    }
    return `Сохранено: СЦЕНА ${id}`;
}

function updateQuestMenuButtons(){
    const mainBtn = document.getElementById('questMainBtn');
    const restartBtn = document.getElementById('questRestartBtn');
    const noteEl = document.getElementById('questProgressNote');

    if (!mainBtn) return;

    const progress = getQuestProgress();
    const has = !!(progress && progress.sceneId != null);

    mainBtn.textContent = has ? 'ПРОДОЛЖИТЬ КВЕСТ' : 'ТЕКСТОВЫЙ КВЕСТ';

    if (restartBtn) {
        restartBtn.classList.toggle('hidden', !has);
    }
    if (noteEl) {
        if (has) {
            noteEl.textContent = formatQuestProgressNote(progress);
            noteEl.classList.remove('hidden');
        } else {
            noteEl.textContent = '';
            noteEl.classList.add('hidden');
        }
    }
}

function saveQuestProgress(scene){
    if (!scene || scene.id == null) return;
    // Не пишем в хранилище одно и то же подряд
    if (saveQuestProgress._lastId === scene.id) return;
    saveQuestProgress._lastId = scene.id;

    try {
        const payload = {
            sceneId: scene.id,
            title: scene.title || '',
            savedAt: Date.now()
        };
        localStorage.setItem(QUEST_PROGRESS_KEY, JSON.stringify(payload));
    } catch (_) {
        // ignore
    }

    updateQuestMenuButtons();
}

function clearQuestProgress(){
    saveQuestProgress._lastId = null;
    try { localStorage.removeItem(QUEST_PROGRESS_KEY); } catch (_) {}
    updateQuestMenuButtons();
}

// =============================================
// Quest state (visited scenes + glossary unlocks)
// =============================================

const QUEST_STATE_KEY = 'p1430_quest_state_v1';

const QuestState = (() => {
    let state = null;

    const defaultState = () => ({
        visited: {},      // { [sceneId]: timestamp }
        glossary: {},     // { [termId]: timestamp }
    });

    const load = () => {
        try {
            const raw = localStorage.getItem(QUEST_STATE_KEY);
            if (!raw) {
                state = defaultState();
                return state;
            }
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') {
                state = defaultState();
                return state;
            }
            
            state = {
                visited: (data.visited && typeof data.visited === 'object') ? data.visited : {},
                glossary: (data.glossary && typeof data.glossary === 'object') ? data.glossary : {},
            };
            return state;
        } catch (_) {
            state = defaultState();
            return state;
        }
    };

    const ensure = () => state || load();

    const save = () => {
        try {
            localStorage.setItem(QUEST_STATE_KEY, JSON.stringify(ensure()));
        } catch (_) {
            // ignore
        }
    };

    const reset = () => {
        state = defaultState();
        try { localStorage.removeItem(QUEST_STATE_KEY); } catch (_) {}
        // сразу сохранять не обязательно, но так состояние точно единообразно
        save();
    };

    const isVisited = (sceneId) => {
        if (sceneId == null) return false;
        const st = ensure();
        return !!st.visited[String(sceneId)];
    };

    const markVisited = (sceneId) => {
        if (sceneId == null) return false;
        const id = String(sceneId);
        const st = ensure();
        if (st.visited[id]) return false;
        st.visited[id] = Date.now();
        save();
        return true;
    };

    const unlockTerms = (ids) => {
        const st = ensure();
        const newly = [];
        (ids || []).forEach((termId) => {
            if (!termId) return;
            const id = String(termId);
            if (st.glossary[id]) return;
            st.glossary[id] = Date.now();
            newly.push(id);
        });
        if (newly.length) save();
        return newly;
    };

    const getUnlockedIds = () => Object.keys(ensure().glossary || {});

    return { ensure, load, save, reset, isVisited, markVisited, unlockTerms, getUnlockedIds };
})();

// Keyboard Navigation Function
function initKeyboardNavigation() {
    document.addEventListener('keydown', handleKeyPress);
}

function handleKeyPress(event) {
    // Если событие уже обработано (например, справкой) — не дублируем
    if (event.defaultPrevented) return;
    // Когда открыт модальный оверлей — навигацию квеста блокируем
    if (isAnyOverlayOpen()) return;
    if (gameState.mode !== 'quest' || !gameState.keyboardNavigation) return;

    switch(event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
            event.preventDefault();
            navigateToPreviousChapter();
            break;

        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'Enter':
            event.preventDefault();
            navigateToNextChapter();
            break;

        case 'Escape':
            event.preventDefault();
            returnToMenu();
            break;
    }
}

function navigateToPreviousChapter() {
    if (gameState.currentChapter > 0) {
        gameState.currentChapter--;
        showChapter();
        showNavigationHint('← Предыдущая сцена');
    }
}

function navigateToNextChapter() {
    const currentScene = questScenes[gameState.currentChapter];

    // Если у сцены есть варианты выбора, по умолчанию переходим по первому варианту
    if (currentScene.choices && currentScene.choices.length > 0) {
        const nextId = currentScene.choices[0].next;
        goToChapterById(nextId);
        showNavigationHint('Следующая сцена →');
        return;
    }

    // Если указано поле next как null или undefined, считаем, что это финал
    if (currentScene.next === null || currentScene.next === undefined || currentScene.next === 'final') {
        showFinalScreen();
    } else {
        // Найдём индекс следующей сцены по id
        goToChapterById(currentScene.next);
        showNavigationHint('Следующая сцена →');
    }
}

function showNavigationHint(text) {
    let hint = document.getElementById('navigationHint');

    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'navigationHint';
        hint.className = 'navigation-hint';
        hint.setAttribute('role', 'status');
        hint.setAttribute('aria-live', 'polite');
        document.body.appendChild(hint);
    }

    hint.textContent = text;
    hint.classList.add('is-visible');

    // Не плодим таймеры: если подсказка уже показывалась — переиспользуем
    if (showNavigationHint._timeoutId) {
        clearTimeout(showNavigationHint._timeoutId);
    }
    showNavigationHint._timeoutId = setTimeout(() => {
        const el = document.getElementById('navigationHint');
        if (el) el.classList.remove('is-visible');
    }, 1400);
}

// UI Functions

// =============================================
// Quest internal scale (адаптивная метрика квеста)
// =============================================
const QUEST_REF_WIDTH = 820;
let questScaleResizeHandler = null;
function computeQuestScale(){
    const qm = document.getElementById('questMode');
    if (!qm) return 1;
    const w = qm.clientWidth || window.innerWidth;
    // Мобильный аудит: на узких экранах (360–390px) допускаем чуть более компактную шкалу,
    // чтобы карточки/фото/таймлайн не наезжали друг на друга.
    const s = Math.max(0.78, Math.min(1.12, w / QUEST_REF_WIDTH));
    document.documentElement.style.setProperty('--qs', s.toFixed(3));
    return s;
}
function bindQuestScale(){
    computeQuestScale();
    // Не накапливаем обработчики при повторном входе в квест
    if (questScaleResizeHandler) return;
    questScaleResizeHandler = () => {
        if (gameState && gameState.mode === 'quest') {
            computeQuestScale();
            updateQuestFloatingNavPadding();
        }
    };
    window.addEventListener('resize', questScaleResizeHandler);
}

function unbindQuestScale(){
    if (!questScaleResizeHandler) return;
    window.removeEventListener('resize', questScaleResizeHandler);
    questScaleResizeHandler = null;
}

// =============================================
// Quest extras (Stage‑Quest‑2)
// - Оглавление/карта глав
// - Таймлайн
// - Справочник (термины) с «разблокировкой»
// - Лайтбокс фото сцены
// =============================================

let questTocOverlayEl = null;
let questGlossaryOverlayEl = null;
let questOverlayLastFocus = null;

function isQuestTocOpen(){
    return !!(questTocOverlayEl && questTocOverlayEl.classList.contains('is-open'));
}

function isQuestGlossaryOpen(){
    return !!(questGlossaryOverlayEl && questGlossaryOverlayEl.classList.contains('is-open'));
}


function isQuestOverlayOpen(){
    return isQuestTocOpen() || isQuestGlossaryOpen();
}

function closeQuestOverlays(force = false){
    closeQuestToc(force);
    closeQuestGlossary(force);
}

function stripScenePrefix(title){
    const t = String(title || '').trim();
    return t.replace(/^СЦЕНА\s*\d+\s*:\s*/i, '').trim();
}

function isQuestTocHotkey(e){
    const k = e.key;
    return k === 'g' || k === 'G' || k === 'п' || k === 'П';
}

function isQuestGlossaryHotkey(e){
    const k = e.key;
    return k === 'l' || k === 'L' || k === 'д' || k === 'Д';
}


function toggleQuestToc(){
    if (isQuestTocOpen()) closeQuestToc();
    else openQuestToc();
}

function toggleQuestGlossary(){
    if (isQuestGlossaryOpen()) closeQuestGlossary();
    else openQuestGlossary();
}


function ensureQuestTocOverlay(){
    if (questTocOverlayEl) return;

    questTocOverlayEl = document.createElement('div');
    questTocOverlayEl.id = 'questTocOverlay';
    questTocOverlayEl.className = 'quest-overlay';
    questTocOverlayEl.setAttribute('aria-hidden', 'true');

    questTocOverlayEl.innerHTML = `
        <div class="quest-overlay-backdrop" data-action="close"></div>
        <div class="quest-overlay-dialog" role="dialog" aria-modal="true" aria-label="Главы квеста">
            <div class="quest-overlay-header">
                <div>
                    <div class="quest-overlay-title">Главы квеста</div>
                    <div class="quest-overlay-sub" id="questTocSub">Быстрый переход по сценам</div>
                </div>
                <button type="button" class="quest-overlay-close" data-action="close" aria-label="Закрыть">✕</button>
            </div>
            <div class="quest-overlay-body">
                <div class="quest-toc-list" id="questTocList"></div>
            </div>
        </div>
    `;

    questTocOverlayEl.addEventListener('click', (e) => {
        const action = e.target && e.target.dataset ? e.target.dataset.action : null;
        if (action === 'close') {
            e.preventDefault();
            closeQuestToc();
            return;
        }

        const btn = e.target && e.target.closest ? e.target.closest('[data-scene-id]') : null;
        if (btn && btn.dataset && btn.dataset.sceneId) {
            const id = parseInt(btn.dataset.sceneId, 10);
            if (!Number.isNaN(id)) {
                e.preventDefault();
                closeQuestToc(true);
                goToChapterById(id);
            }
        }
    });

    document.body.appendChild(questTocOverlayEl);
}

function renderQuestToc(){
    ensureQuestTocOverlay();
    const listEl = document.getElementById('questTocList');
    if (!listEl) return;

    const total = questScenes.length || 1;
    const currentScene = questScenes[gameState.currentChapter];
    const currentId = currentScene ? currentScene.id : null;

    listEl.innerHTML = (questScenes || []).map((sc) => {
        const title = stripScenePrefix(sc.title);
        const year = (sc.year != null && sc.year !== '') ? String(sc.year) : '';
        const place = sc.place ? String(sc.place) : '';
        const visited = QuestState.isVisited(sc.id);
        const active = (currentId != null && sc.id === currentId);
        const meta = [year, place].filter(Boolean).join(' • ');

        const cls = ['quest-toc-item'];
        if (visited) cls.push('is-visited');
        if (active) cls.push('is-active');

        return `
            <button type="button" class="${cls.join(' ')}" data-scene-id="${sc.id}" aria-label="Сцена ${sc.id}/${total}: ${title}">
                <div class="quest-toc-left">
                    <div class="quest-toc-title">${title}</div>
                    <div class="quest-toc-meta">${meta || '—'}</div>
                </div>
                <div class="quest-toc-right">
                    <span class="quest-toc-badge">${visited ? '✓' : '•'}</span>
                </div>
            </button>
        `;
    }).join('');
}

function openQuestToc(){
    ensureQuestTocOverlay();
    renderQuestToc();

    questOverlayLastFocus = document.activeElement;
    questTocOverlayEl.setAttribute('aria-hidden', 'false');
    questTocOverlayEl.classList.add('is-open');
    updateBodyScrollLock();

    const closeBtn = questTocOverlayEl.querySelector('.quest-overlay-close');
    if (closeBtn) closeBtn.focus();
}

function closeQuestToc(force = false){
    if (!questTocOverlayEl) return;
    questTocOverlayEl.setAttribute('aria-hidden', 'true');
    questTocOverlayEl.classList.remove('is-open');
    updateBodyScrollLock();

    if (!force && questOverlayLastFocus && typeof questOverlayLastFocus.focus === 'function') {
        try { questOverlayLastFocus.focus(); } catch (_) {}
    }
}

function ensureQuestGlossaryOverlay(){
    if (questGlossaryOverlayEl) return;

    questGlossaryOverlayEl = document.createElement('div');
    questGlossaryOverlayEl.id = 'questGlossaryOverlay';
    questGlossaryOverlayEl.className = 'quest-overlay';
    questGlossaryOverlayEl.setAttribute('aria-hidden', 'true');

    questGlossaryOverlayEl.innerHTML = `
        <div class="quest-overlay-backdrop" data-action="close"></div>
        <div class="quest-overlay-dialog" role="dialog" aria-modal="true" aria-label="Справочник">
            <div class="quest-overlay-header">
                <div>
                    <div class="quest-overlay-title">Справочник</div>
                    <div class="quest-overlay-sub" id="questGlossarySub">Термины открываются по мере прохождения</div>
                </div>
                <button type="button" class="quest-overlay-close" data-action="close" aria-label="Закрыть">✕</button>
            </div>
            <div class="quest-overlay-body">
                <div class="quest-glossary-list" id="questGlossaryList"></div>
            </div>
        </div>
    `;

    questGlossaryOverlayEl.addEventListener('click', (e) => {
        const action = e.target && e.target.dataset ? e.target.dataset.action : null;
        if (action === 'close') {
            e.preventDefault();
            closeQuestGlossary();
        }
    });

    document.body.appendChild(questGlossaryOverlayEl);
}

function renderQuestGlossary(){
    ensureQuestGlossaryOverlay();
    const listEl = document.getElementById('questGlossaryList');
    const subEl = document.getElementById('questGlossarySub');
    if (!listEl) return;

    const st = QuestState.ensure();
    const unlockedIds = QuestState.getUnlockedIds();

    const allCount = GlossaryDB.all().length || 0;
    if (subEl) {
        subEl.textContent = `Открыто: ${unlockedIds.length}/${allCount}`;
    }

    const items = unlockedIds
        .map((id) => {
            const it = GlossaryDB.get(id);
            return {
                id,
                t: (st.glossary && st.glossary[id]) ? st.glossary[id] : 0,
                term: it ? it.term : id,
                definition: it ? it.definition : ''
            };
        })
        .sort((a, b) => (a.t || 0) - (b.t || 0));

    if (!items.length) {
        listEl.innerHTML = `
            <div class="quest-empty">
                <div class="quest-empty-title">Пока пусто</div>
                <div class="quest-empty-sub">Пройдите пару сцен — и здесь появятся новые термины ✨</div>
            </div>
        `;
        return;
    }

    listEl.innerHTML = items.map((it) => {
        return `
            <div class="quest-glossary-item">
                <div class="quest-glossary-term">${it.term}</div>
                <div class="quest-glossary-def">${it.definition}</div>
            </div>
        `;
    }).join('');
}

function openQuestGlossary(){
    ensureQuestGlossaryOverlay();
    renderQuestGlossary();

    questOverlayLastFocus = document.activeElement;
    questGlossaryOverlayEl.setAttribute('aria-hidden', 'false');
    questGlossaryOverlayEl.classList.add('is-open');
    updateBodyScrollLock();

    const closeBtn = questGlossaryOverlayEl.querySelector('.quest-overlay-close');
    if (closeBtn) closeBtn.focus();
}

function closeQuestGlossary(force = false){
    if (!questGlossaryOverlayEl) return;
    questGlossaryOverlayEl.setAttribute('aria-hidden', 'true');
    questGlossaryOverlayEl.classList.remove('is-open');
    updateBodyScrollLock();

    if (!force && questOverlayLastFocus && typeof questOverlayLastFocus.focus === 'function') {
        try { questOverlayLastFocus.focus(); } catch (_) {}
    }
}


function buildQuestTimelineHTML(){
    const total = questScenes.length || 1;
    const currentScene = questScenes[gameState.currentChapter];
    const currentId = currentScene ? currentScene.id : null;

    return (questScenes || []).map((sc) => {
        const year = (sc.year != null && sc.year !== '') ? String(sc.year) : '';
        const title = stripScenePrefix(sc.title);
        const visited = QuestState.isVisited(sc.id);
        const active = (currentId != null && sc.id === currentId);

        const cls = ['timeline-node'];
        if (visited) cls.push('is-visited');
        if (active) cls.push('is-active');

        return `
            <button type="button" class="${cls.join(' ')}" onclick="goToChapterById(${sc.id})" title="${year ? year + ' • ' : ''}${title}" aria-label="Сцена ${sc.id}/${total}: ${title}">
                <span class="timeline-dot"></span>
                <span class="timeline-year">${year || ''}</span>
            </button>
        `;
    }).join('');
}

function getQuestLightboxItems(){
    return (questScenes || []).map((sc) => ({
        src: sc.photo,
        caption: sc.photoCaption || stripScenePrefix(sc.title)
    }));
}

function openQuestPhotoLightbox(){
    const items = getQuestLightboxItems();
    const idx = Math.max(0, Math.min(items.length - 1, gameState.currentChapter || 0));
    openLightbox(idx, items);
}

function continueQuest() {
    // Запускаем квест либо продолжаем с последнего сохранения.
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('app').classList.add('active');
    document.getElementById('questMode').classList.remove('hidden');
    gameState.mode = 'quest';
    gameState.keyboardNavigation = true;

    const progress = getQuestProgress();
    const subtitle = (progress && progress.sceneId != null)
        ? `Продолжение: сцена ${progress.sceneId}`
        : 'Запускаю архив…';

    showModeSplash('ТЕКСТОВЫЙ КВЕСТ', subtitle);

    SoundManager.stop();
    SoundManager.play('quest');

    const startFromSaved = () => {
        let startIndex = 0;
        const p = getQuestProgress();
        if (p && p.sceneId != null) {
            const idx = questScenes.findIndex(sc => sc.id === p.sceneId);
            if (idx >= 0) startIndex = idx;
            else clearQuestProgress();
        }

        // Если возобновляемся не с начала — подтягиваем «посещено/открыто» для предыдущих сцен.
        // Предполагаем линейное прохождение (это удобно и для демо, и для реальной игры).
        if (startIndex > 0) {
            for (let i = 0; i <= startIndex; i++) {
                const sc = questScenes[i];
                if (!sc || sc.id == null) continue;
                QuestState.markVisited(sc.id);
                QuestState.unlockTerms(sc.glossaryUnlock || []);
            }
        }

        gameState.currentChapter = startIndex;
        showChapter(startIndex);
        document.body.classList.add('quest-scale-active');
        bindQuestScale();
    };

    // Загружаем сцены, затем отображаем сохранённую или первую
    loadScenes().then(startFromSaved).catch(startFromSaved);
}

function restartQuest() {
    // Полный рестарт квеста с первой сцены (удобно на защите)
    clearQuestProgress();
    startQuest();
}

function startQuest() {
     // Старт с нуля: очищаем автосейв и начинаем с первой сцены.
    clearQuestProgress();
    // Сбрасываем «карман» квеста: посещённые сцены и открытые термины
    QuestState.reset();

    // Запускаем режим квеста. Предварительно загружаем данные сцен из внешнего файла.
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('app').classList.add('active');
    document.getElementById('questMode').classList.remove('hidden');
    gameState.mode = 'quest';
    gameState.keyboardNavigation = true;

    showModeSplash('ТЕКСТОВЫЙ КВЕСТ', 'Запускаю архив…');

    SoundManager.stop();
    SoundManager.play('quest');

    // Загружаем сцены, затем отображаем первую
    loadScenes().then(() => {
        gameState.currentChapter = 0;
        showChapter(0);
        document.body.classList.add('quest-scale-active');
        bindQuestScale();
        // Навигационные кнопки теперь встроены в сами сцены (через кнопку "Вперёд" или выбор).
        // Поэтому мы не добавляем внешнюю панель навигации, чтобы избежать дублирования.
    }).catch(() => {
        // если загрузка не удалась, используем встроенные сцены
        gameState.currentChapter = 0;
        showChapter(0);
        document.body.classList.add('quest-scale-active');
        bindQuestScale();
        // Навигационные кнопки теперь встроены в сами сцены (через кнопку "Вперёд" или выбор).
        // Поэтому мы не добавляем внешнюю панель навигации, чтобы избежать дублирования.
    });
}

function startDefense() {
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('app').classList.add('active');
    document.getElementById('defenseMode').classList.remove('hidden');
    gameState.mode = 'defense';
    gameState.keyboardNavigation = false;

    showModeSplash('ПОЛИГОН ИСПЫТАНИЙ', 'Запуск симуляции…');

    SoundManager.stop();
    SoundManager.play('defense');

    loadDefenseBalance().finally(() => {
        initDefenseGame();
    });
}


function updateQuestFloatingNavPadding(){
    const qc = document.getElementById('questContainer');
    if (!qc) return;
    // PRE-RELEASE: Навигация сцен теперь находится *под сценой* (в потоке),
    // а не как фиксированный оверлей. Поэтому дополнительный нижний отступ
    // больше не нужен (иначе появится лишняя "пустота").
    qc.classList.remove('has-floating-nav');
    qc.style.removeProperty('--floating-nav-h');
}

function addNavigationButtons() {
    const container = document.getElementById('questContainer');
    if (!container) return;

    // Размещаем навигацию *под сценой* (внутри карточки сцены),
    // чтобы она выглядела как часть интерфейса квеста и не перекрывала контент.
    const host = container.querySelector('.chapter') || container;

    let navButtons = document.getElementById('navButtons');

    if (!navButtons) {
        navButtons = document.createElement('div');
        navButtons.id = 'navButtons';
        navButtons.className = 'nav-floating';

        const prevButton = document.createElement('button');
        prevButton.type = 'button';
        prevButton.className = 'nav-icon-btn nav-prev';
        prevButton.innerHTML = '◀';
        prevButton.setAttribute('aria-label', 'Назад');
        prevButton.setAttribute('title', 'Назад');
        prevButton.dataset.tip = 'Назад';
        prevButton.onclick = navigateToPreviousChapter;

        const nextButton = document.createElement('button');
        nextButton.type = 'button';
        nextButton.className = 'nav-icon-btn nav-next';
        nextButton.innerHTML = '▶';
        nextButton.setAttribute('aria-label', 'Вперёд');
        nextButton.setAttribute('title', 'Вперёд');
        nextButton.dataset.tip = 'Вперёд';
        nextButton.onclick = navigateToNextChapter;

        const press = (btn) => {
            if (btn.disabled) return;
            btn.style.transform = 'translateY(1px) scale(0.97)';
        };
        const release = (btn) => {
            btn.style.transform = 'translateY(0) scale(1)';
        };

        [prevButton, nextButton].forEach((btn) => {
            btn.addEventListener('pointerdown', () => press(btn));
            btn.addEventListener('pointerup', () => release(btn));
            btn.addEventListener('pointercancel', () => release(btn));
            btn.addEventListener('pointerleave', () => release(btn));
        });

        navButtons.appendChild(prevButton);
        navButtons.appendChild(nextButton);
        host.appendChild(navButtons);
    }

    updateNavigationButtons();
}

function returnToMenu() {
    document.body.classList.remove('quest-scale-active');
    document.documentElement.style.setProperty('--qs','1');
    // Снимаем обработчик ресайза квеста, чтобы не накапливать слушатели
    unbindQuestScale();

    // Закрываем модальные оверлеи (если они открыты)
    closeLightbox(true);
    closeHelpOverlay(true);
    closeQuestOverlays(true);
    closeDefenseGameOver({ force: true });
    const tut = document.getElementById('defenseTutorial');
    if (tut) {
        tut.classList.remove('is-open');
        tut.setAttribute('aria-hidden', 'true');
    }
    // На всякий случай снимаем подсветку элементов обучения
    if (typeof setDefenseTutorialHighlight === 'function') {
        setDefenseTutorialHighlight(false);
    }
    updateBodyScrollLock();
    document.getElementById('app').classList.remove('active');
    document.getElementById('questMode').classList.add('hidden');
    document.getElementById('defenseMode').classList.add('hidden');
    const galleryModeEl = document.getElementById('galleryMode');
    if (galleryModeEl) galleryModeEl.classList.add('hidden');
    document.getElementById('loadingScreen').classList.remove('hidden');

    if (gameState.gameLoop) {
        cancelAnimationFrame(gameState.gameLoop);
    }

    const hint = document.getElementById('navigationHint');
    if (hint) hint.remove();

    if (showNavigationHint._timeoutId) {
        clearTimeout(showNavigationHint._timeoutId);
        showNavigationHint._timeoutId = null;
    }

    const navButtons = document.getElementById('navButtons');
    if (navButtons) navButtons.remove();

    // Перед возвратом в меню отменяем все таймеры спавна и очищаем обработчик клика на канвасе
    if (Array.isArray(gameState.spawnTimeouts)) {
        gameState.spawnTimeouts.forEach(id => clearTimeout(id));
    }
    const canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) {
        canvasEl.onclick = null;
        canvasEl.onpointermove = null;
        canvasEl.onpointerleave = null;
        canvasEl.onpointerdown = null;
    }

    // Снимаем обработчик ресайза канваса, чтобы не накапливать слушатели
    if (gameState && gameState._defenseResizeHandler) {
        window.removeEventListener('resize', gameState._defenseResizeHandler);
    }

    gameState = {
        mode: null,
        currentChapter: 0,
        health: 100,
        resources: 1500,
        wave: 1,
        towers: [],
        enemies: [],
        effects: [],
        projectiles: [],
        _lastFrameTime: 0,

        selectedTower: null,
        selectedPlacedTower: null,

        pointer: { x: 0, y: 0, active: false },
        placement: { ok: false, reason: '' },

        paused: false,
        timeScale: 1,
        defenseTime: 0,
        spawnQueue: [],

        gameLoop: null,
        enemiesRemaining: 0,
        enemiesTotal: 0,

        keyboardNavigation: true,
        spawnTimeouts: [],

        waveStats: null,
        waveSummaryShown: false
    };

    // Обновляем меню квеста (кнопка «Продолжить» / «Начать заново»)
    updateQuestMenuButtons();

    SoundManager.stop();
    SoundManager.play('menu');
}

function showChapter(index) {
    // Если передан индекс, переходим к нему
    if (typeof index === 'number') {
        gameState.currentChapter = index;
    }

    const scene = questScenes[gameState.currentChapter];
    const container = document.getElementById('questContainer');
    if (!scene || !container) return;

    // Собираем диалог (музейная экспозиция + диалоговая подача)
    let dialogHTML = '';
    if (scene.dialog && Array.isArray(scene.dialog)) {
        scene.dialog.forEach((line, i) => {
            const isArchive = line.speaker === 'archive';
            const speakerName = isArchive ? 'АРХИВ' : 'ШКОЛЬНИК';
            const speakerClass = isArchive ? 'speaker-archive' : 'speaker-student';
            const lineClass = isArchive ? 'dialog-archive' : 'dialog-student';
            const icon = isArchive ? '📜' : '🎒';
            const delay = Math.min(700, i * 60);

            dialogHTML += `
                <div class="dialog-line ${lineClass}" style="--delay:${delay}ms">
                    <div class="speaker ${speakerClass}">
                        <span class="speaker-icon">${icon}</span>
                        <span class="speaker-name">${speakerName}</span>
                    </div>
                    <div class="dialog-text">${line.text}</div>
                </div>
            `;
        });
    }

    // Формируем кнопки выбора или кнопку продолжения
    let choiceButtonsHTML = '';
    if (scene.choices && Array.isArray(scene.choices)) {
        scene.choices.forEach(choice => {
            choiceButtonsHTML += `
                <button type="button" class="choice-btn" onclick="goToChapterById(${choice.next})">
                    <span class="btn-icon">▶</span>
                    <span class="btn-text">${choice.text}</span>
                </button>
            `;
        });
    } else if (scene.buttonText) {
        // Для обычных сцен с единственной кнопкой «Следующая сцена» не создаём внутреннюю кнопку,
        // чтобы навигация осуществлялась через общую панель навигации.
        choiceButtonsHTML = '';
    }

    const total = questScenes.length || 1;
    const currentNumber = scene.id || gameState.currentChapter + 1;
    const progressPercent = Math.min(100, ((gameState.currentChapter + 1) / total) * 100);

    // 1) Отмечаем сцену как посещённую и открываем термины (если есть)
    QuestState.markVisited(scene.id);
    const newlyUnlocked = QuestState.unlockTerms(scene.glossaryUnlock || []);
    if (newlyUnlocked && newlyUnlocked.length) {
        const names = newlyUnlocked
            .map((id) => {
                const it = GlossaryDB.get(id);
                return it && it.term ? it.term : id;
            })
            .filter(Boolean);
        const shown = names.slice(0, 3);
        const msg = (names.length === 1)
            ? `📘 В справочник добавлено: ${shown[0]}`
            : `📘 Новые термины: ${shown.join(', ')}${names.length > 3 ? '…' : ''}`;
        showToast(msg, 'info');
    }

    // 2) Метаданные сцены: год/место (если указаны), иначе пробуем вытащить год из текста
    const combinedText = (scene.dialog || []).map(l => (l && l.text) ? l.text : '').join(' ');
    const yearMatch = combinedText.match(/\b(19\d{2}|20\d{2})\b/);
    const yearFromText = yearMatch ? yearMatch[1] : '';
    const year = (scene.year != null && scene.year !== '') ? String(scene.year) : yearFromText;
    const place = scene.place ? String(scene.place) : '';
    const yearPlace = [year, place].filter(Boolean).join(' • ');

    // Чипы метаданных (как музейная табличка)
    let metaChips = '';
    if (year) metaChips += `<span class="meta-chip">${year}</span>`;
    if (place) metaChips += `<span class="meta-chip">${place}</span>`;
    metaChips += `<span class="meta-chip">АРХИВ 1430</span>`;
    metaChips += `<span class="meta-chip meta-chip--scene">СЦЕНА ${currentNumber}/${total}</span>`;

    const timelineHTML = buildQuestTimelineHTML();

    container.innerHTML = `
        <div class="quest-head">
            <div class="quest-head-row">
                <div class="quest-head-left">
                    <div class="quest-head-scene">СЦЕНА ${currentNumber}/${total}</div>
                    <div class="quest-head-sub">${yearPlace || 'АРХИВ 1430'}</div>
                </div>
                <div class="quest-head-actions">
                    <button type="button" class="quest-tool-btn" onclick="openQuestToc()" aria-label="Открыть главы (G)">
                        <span class="quest-tool-emoji">📜</span>
                        <span class="quest-tool-text">Главы</span>
                    </button>
                    <button type="button" class="quest-tool-btn" onclick="openQuestGlossary()" aria-label="Открыть справочник (L)">
                        <span class="quest-tool-emoji">📘</span>
                        <span class="quest-tool-text">Справочник</span>
                    </button>                </div>
            </div>
            <div class="quest-timeline" role="navigation" aria-label="Таймлайн квеста">
                ${timelineHTML}
            </div>
        </div>

        <div class="chapter chapter--museum">
            <div class="chapter-header">
                <div class="chapter-kicker">ИНТЕРАКТИВНАЯ ЭКСПОЗИЦИЯ</div>
                <div class="chapter-meta">${metaChips}</div>
                <h1 class="chapter-title">${scene.title}</h1>
                <div class="chapter-progress">
                    <div class="progress-bar" style="width: ${progressPercent}%"></div>
                </div>
            </div>

            <div class="chapter-body">
                <div class="chapter-media">
                    <button type="button" class="photo-container photo-button" onclick="openQuestPhotoLightbox()" aria-label="Открыть фото в полный экран">
                        <img src="${scene.photo}" alt="${scene.title}" class="chapter-photo" />
                        <div class="photo-overlay"></div>
                        <div class="photo-zoom-hint" aria-hidden="true">🔍</div>
                    </button>
                    <p class="photo-caption">${scene.photoCaption || ''}</p>
                </div>

                <div class="chapter-content">${dialogHTML}</div>
            </div>

            <div class="choice-buttons">
                ${choiceButtonsHTML}
            </div>
        </div>
    `;

    // Добавляем навигационную панель для управления переходами по сценам
    addNavigationButtons();
    // Автосейв прогресса квеста
    saveQuestProgress(scene);
    container.scrollTop = 0;
    requestAnimationFrame(updateQuestFloatingNavPadding);
}


function updateNavigationButtons() {
    const navButtons = document.getElementById('navButtons');
    if (!navButtons) return;

    const prevButton = navButtons.querySelector('.nav-prev') || navButtons.querySelector('button:first-child');
    const nextButton = navButtons.querySelector('.nav-next') || navButtons.querySelector('button:last-child');

    // Назад: отключаем на первой сцене
    const isFirst = gameState.currentChapter === 0;
    if (prevButton) {
        prevButton.disabled = isFirst;
        prevButton.classList.toggle('is-disabled', isFirst);
    }

    // Вперёд: на финальной сцене показываем "🏁"
    const currentScene = questScenes[gameState.currentChapter];
    // Финал считаем и при next: null/undefined (как в scenes.json), и при next: 'final' (старый формат)
    const isFinal = !!currentScene && (currentScene.next == null || currentScene.next === 'final');

    if (nextButton) {
        if (isFinal) {
            nextButton.innerHTML = '🏁';
            nextButton.dataset.tip = 'Завершить';
            nextButton.title = 'Завершить';
            nextButton.setAttribute('aria-label', 'Завершить');
        } else {
            nextButton.innerHTML = '▶';
            nextButton.dataset.tip = 'Вперёд';
            nextButton.title = 'Вперёд';
            nextButton.setAttribute('aria-label', 'Вперёд');
        }
    }
}

function showFinalScreen() {
    // Финал = квест завершён, прогресс больше не нужен
    clearQuestProgress();
    const container = document.getElementById('questContainer');

    container.innerHTML = `
        <div class="final-screen">
            <div class="final-header">
                <h1 class="final-title">${finalScreen.title}</h1>
                <div class="final-icon">🏆</div>
            </div>
            <div class="photo-container">
                <img src="${finalScreen.photo}" alt="Final" class="chapter-photo" />
                <div class="photo-overlay final"></div>
            </div>
            <p class="photo-caption">${finalScreen.photoCaption}</p>
            <div class="final-content">${finalScreen.content}</div>
            <button type="button" class="return-menu-btn" onclick="returnToMenu()">
                <span class="btn-icon">🏠</span>
                <span class="btn-text">ВЕРНУТЬСЯ В ГЛАВНОЕ МЕНЮ</span>
            </button>
        </div>
    `;

    const navButtons = document.getElementById('navButtons');
    if (navButtons) navButtons.remove();

    container.scrollTop = 0;
}

function nextChapter() {
    navigateToNextChapter();
}

// =============================================
// Загрузка сцен из внешнего JSON-файла
// =============================================

async function loadScenes() {
    // Чтобы не загружать файл несколько раз, запоминаем результат
    if (loadScenes.loaded) return questScenes;

    // Если страница открыта как file://, fetch('scenes.json') часто блокируется браузером.
    // В таком режиме просто используем встроенные сцены и не спамим ошибками в консоль.
    try {
        if (location && location.protocol === 'file:') {
            loadScenes.loaded = true;
            return questScenes;
        }
    } catch (_) {
        // На всякий случай: если location недоступен, продолжаем обычную попытку загрузки.
    }
    try {
        const response = await fetch('scenes.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        questScenes = data;
        loadScenes.loaded = true;
    } catch (e) {
        console.warn('Не удалось загрузить scenes.json — используем встроенные сцены.', e);
        // В случае ошибки оставляем встроенный набор сцен и помечаем как загруженный,
        // чтобы не повторять попытку и не плодить одинаковые сообщения.
        loadScenes.loaded = true;
    }
    return questScenes;
}

// Переход к сцене по её идентификатору (id)
function goToChapterById(id) {
    const index = questScenes.findIndex(sc => sc.id === id);
    if (index >= 0) {
        gameState.currentChapter = index;
        showChapter(index);
    }
}

// =============================================
// Галерея изображений
// =============================================

function startGallery() {
    // Переключаем отображение: показываем приложение и галерею
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('app').classList.add('active');
    document.getElementById('questMode').classList.add('hidden');
    document.getElementById('defenseMode').classList.add('hidden');
    document.getElementById('galleryMode').classList.remove('hidden');
    gameState.mode = 'gallery';
    showModeSplash('ГАЛЕРЕЯ', 'Открываю архив фото…');
    // В галерее проигрываем музыку меню
    SoundManager.stop();
    SoundManager.play('menu');
    buildGallery();
}

// Список изображений и подписей для галереи
const galleryImages = [
    { src: 'img/15Кисунько Г.В. (1918-1998).jpg', caption: 'Г.В. Кисунько' },
    { src: 'img/2а Юный Григорий Кисунько.jpg', caption: 'Юный Григорий' },
    { src: 'img/4Кисунько Г.В. - аспирант.jpg', caption: 'Аспирант' },
    { src: 'img/3Ворошиловградский пединститут.jpg', caption: 'Ворошиловградский пединститут' },
    { src: 'img/5Кисунько Г.В. - рядовой ополчения.jpg', caption: 'Рядовой ополчения' },
    { src: 'img/8Военная академия связи им. С.М. Буденного.jpg', caption: 'Военная академия связи им. С.М. Буденного' },
    { src: 'img/10Система С-25 С ЗРК Беркут.jpg', caption: 'Система С-25' },
    { src: 'img/11Золотая медаль «Серп и Молот» Героя Социалистического Труда.jpg', caption: 'Герой Соцтруда' },
    { src: 'img/12Система А - экспериментальный комплекс.jpg', caption: 'Система “А”' },
    { src: 'img/13Пуск противоракеты.jpg', caption: 'Испытания. Пуск' },
    { src: 'img/6Кисунько Г.В.- курсант ВНОС.jpg', caption: 'Кисунько Г.В.- курсант ВНОС' },
    { src: 'img/9Кисунько Г.В. - КБ-1.webp', caption: 'Кисунько Г.В. - КБ-1' },
    { src: 'img/7Кисунько Г.В. - командир взвода.jpg', caption: 'Кисунько Г.В. - командир взвода' },
    { src: 'img/14музейный экспонат - памятник создателям ПРО.jpg', caption: 'музейный экспонат - памятник создателям ПРО' }
];

function buildGallery() {
    const container = document.getElementById('galleryContainer');
    if (!container) return;
    container.innerHTML = '';

    galleryImages.forEach((item, idx) => {
        // Делаем карточку кнопкой: и кликается, и фокусируется с клавиатуры
        const wrapper = document.createElement('button');
        wrapper.type = 'button';
        wrapper.className = 'gallery-item';
        wrapper.dataset.index = String(idx);
        wrapper.setAttribute('aria-label', item.caption);
        wrapper.addEventListener('click', () => openLightbox(idx));

        const img = document.createElement('img');
        img.src = item.src;
        img.alt = item.caption;
        img.loading = 'lazy';
        img.decoding = 'async';

        const caption = document.createElement('div');
        caption.className = 'gallery-caption';
        caption.textContent = item.caption;

        wrapper.appendChild(img);
        wrapper.appendChild(caption);
        container.appendChild(wrapper);
    });
}

// ===============================
// Gallery Lightbox (эффектно на защите ✨)
// ===============================
let lightboxOverlay = null;
let lightboxIndex = 0;
let lightboxLastFocus = null;
let lightboxItems = null;

function ensureLightbox() {
    if (lightboxOverlay) return;

    lightboxOverlay = document.createElement('div');
    lightboxOverlay.id = 'lightboxOverlay';
    lightboxOverlay.className = 'lightbox-overlay';
    lightboxOverlay.setAttribute('aria-hidden', 'true');

    lightboxOverlay.innerHTML = `
        <div class="lightbox-backdrop" data-action="close"></div>
        <div class="lightbox-dialog" role="dialog" aria-modal="true" aria-label="Просмотр изображения">
            <button type="button" class="lightbox-close" data-action="close" aria-label="Закрыть">✕</button>
            <button type="button" class="lightbox-nav lightbox-prev" data-action="prev" aria-label="Предыдущее">◀</button>
            <img class="lightbox-image" id="lightboxImage" alt="" />
            <button type="button" class="lightbox-nav lightbox-next" data-action="next" aria-label="Следующее">▶</button>
            <div class="lightbox-caption" id="lightboxCaption"></div>
        </div>
    `;

    document.body.appendChild(lightboxOverlay);

    // Клики по фону/кнопкам
    lightboxOverlay.addEventListener('click', (e) => {
        const action = e.target && e.target.dataset ? e.target.dataset.action : null;
        if (action === 'close') {
            closeLightbox();
            return;
        }
        if (action === 'prev') {
            stepLightbox(-1);
            return;
        }
        if (action === 'next') {
            stepLightbox(1);
            return;
        }
    });

    // Клавиатура: Esc / ← / →
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        if (!isLightboxOpen()) return;
        // Если поверх открыт другой диалог — не реагируем
        if (isHelpOpen() || isDefenseTutorialOpen()) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeLightbox();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            stepLightbox(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            stepLightbox(1);
        }
    });
}

function isLightboxOpen() {
    return !!(lightboxOverlay && lightboxOverlay.classList.contains('is-open'));
}

function openLightbox(index, items = null) {
    ensureLightbox();
    lightboxLastFocus = document.activeElement;
    lightboxItems = (Array.isArray(items) && items.length) ? items : galleryImages;
    if (!lightboxItems || !lightboxItems.length) return;
    lightboxIndex = Math.max(0, Math.min(lightboxItems.length - 1, index));
    updateLightbox();

    lightboxOverlay.setAttribute('aria-hidden', 'false');
    lightboxOverlay.classList.add('is-open');
    updateBodyScrollLock();

    const closeBtn = lightboxOverlay.querySelector('.lightbox-close');
    if (closeBtn) closeBtn.focus();
}

function updateLightbox() {
    if (!lightboxOverlay) return;
    const img = document.getElementById('lightboxImage');
    const cap = document.getElementById('lightboxCaption');
    const items = (lightboxItems && lightboxItems.length) ? lightboxItems : galleryImages;
    const item = items[lightboxIndex];
    if (!item) return;

    if (img) {
        img.src = item.src;
        img.alt = item.caption;
    }
    if (cap) cap.textContent = item.caption;
}

function stepLightbox(delta) {
    const items = (lightboxItems && lightboxItems.length) ? lightboxItems : galleryImages;
    if (!items.length) return;
    lightboxIndex = (lightboxIndex + delta) % items.length;
    if (lightboxIndex < 0) lightboxIndex = items.length - 1;
    updateLightbox();
}

function closeLightbox(force = false) {
    if (!lightboxOverlay) return;

    lightboxOverlay.setAttribute('aria-hidden', 'true');
    lightboxOverlay.classList.remove('is-open');
    updateBodyScrollLock();

    if (!force && lightboxLastFocus && typeof lightboxLastFocus.focus === 'function') {
        try { lightboxLastFocus.focus(); } catch (_) {}
    }
}

// =============================================
// Canvas resize helpers (адаптивность "Полигона")
// =============================================

/**
 * Синхронизирует внутреннее разрешение canvas с его CSS‑размерами.
 * Это устраняет "мыло", корректирует масштаб и делает размещение башен
 * совпадающим с визуальным размером поля.
 */
function syncCanvasToCssSize(canvas) {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    if (!cssW || !cssH) return;

    if (canvas.width === cssW && canvas.height === cssH) return;

    const prevW = canvas.width || cssW;
    const prevH = canvas.height || cssH;

    // Масштабируем координаты уже размещённых объектов (чтобы они не "скакали" при ресайзе)
    if (gameState && gameState.mode === 'defense') {
        const sx = cssW / prevW;
        const sy = cssH / prevH;

        if (Array.isArray(gameState.towers)) {
            gameState.towers.forEach(t => {
                t.x *= sx;
                t.y *= sy;
            });
        }
        if (Array.isArray(gameState.enemies)) {
            gameState.enemies.forEach(e => {
                e.x *= sx;
                e.y *= sy;
            });
        }

        // Короткоживущие эффекты и снаряды лучше сбросить при изменении масштаба
        // (они быстро восстановятся, но не будут выглядеть "сломано").
        gameState.effects = [];
        gameState.projectiles = [];
    }

    canvas.width = cssW;
    canvas.height = cssH;
}

/**
 * Подписка на resize для поля "Полигона" с мягким дебаунсом.
 */
function attachDefenseResizeHandler(canvas) {
    // Если ранее уже подписывались — снимаем, чтобы не плодить обработчики
    if (gameState && gameState._defenseResizeHandler) {
        window.removeEventListener('resize', gameState._defenseResizeHandler);
    }

    let t = null;
    const handler = () => {
        if (!gameState || gameState.mode !== 'defense') return;
        if (t) clearTimeout(t);
        t = setTimeout(() => syncCanvasToCssSize(canvas), 120);
    };

    if (gameState) gameState._defenseResizeHandler = handler;
    window.addEventListener('resize', handler, { passive: true });
}

// Tower Defense Game

// =============================================
// Defense: placement preview + upgrades + HUD
// =============================================

function computeTowerStats(typeIndex, level = 1){
    const base = towerTypes[typeIndex];
    if (!base) return { range: 0, damage: 0, firerate: 0 };

    const lvl = Math.max(1, Math.min(3, level | 0));
    const step = lvl - 1;

    const up = (base.upgrade && typeof base.upgrade === 'object') ? base.upgrade : {};
    const rs = Number.isFinite(Number(up.rangeStep)) ? Number(up.rangeStep) : 0.12;
    const ds = Number.isFinite(Number(up.damageStep)) ? Number(up.damageStep) : 0.35;
    const fs = Number.isFinite(Number(up.firerateStep)) ? Number(up.firerateStep) : 0.18;

    // Баланс: лёгкий рост дальности/скорости и более заметный рост урона (настраивается в towers.json)
    const range = Math.round(base.range * (1 + rs * step));
    const damage = Math.round(base.damage * (1 + ds * step));
    const firerate = +(base.firerate * (1 + fs * step)).toFixed(2);

    return { range, damage, firerate };
}

function computeTowerOnHitEffects(typeIndex, level = 1){
    const base = towerTypes[typeIndex];
    if (!base) return [];

    const lvl = Math.max(1, Math.min(3, level | 0));
    const step = lvl - 1;
    const effects = [];

    // Stage-14: один статус‑эффект (замедление) — по конфигу
    const slow = base.effects && base.effects.slow;
    if (slow && typeof slow === 'object') {
        const mult0 = Number(slow.mult);
        const dur0 = Number(slow.durationMs);
        const scale = (slow.scale && typeof slow.scale === 'object') ? slow.scale : {};
        const multStep = Number(scale.multStep);
        const durStep = Number(scale.durationStep);

        let mult = (Number.isFinite(mult0) ? mult0 : 0.75) + step * (Number.isFinite(multStep) ? multStep : 0);
        let durationMs = (Number.isFinite(dur0) ? dur0 : 900) + step * (Number.isFinite(durStep) ? durStep : 0);

        // Безопасные границы
        mult = Math.max(0.35, Math.min(0.98, mult));
        durationMs = Math.max(250, Math.round(durationMs));

        effects.push({ type: 'slow', mult, durationMs });
    }

    return effects;
}

function ensureTowerRuntimeFields(tower){
    if (!tower) return;

    if (tower.level == null) tower.level = 1;

    const base = towerTypes[tower.type] || towerTypes[0];
    if (tower.spent == null) tower.spent = base ? base.cost : 0;

    // Приоритет цели (Stage-14)
    if (tower.targeting == null) {
        tower.targeting = (base && base.targetingDefault) ? String(base.targetingDefault) : 'nearest';
    }

    // Если в старых версиях не было конкретных статов — проставим
    if (tower.range == null || tower.damage == null || tower.firerate == null) {
        const st = computeTowerStats(tower.type, tower.level);
        tower.range = st.range;
        tower.damage = st.damage;
        tower.firerate = st.firerate;
    }

    // Эффекты (Stage-14)
    if (tower._effectsLevel !== tower.level) {
        tower.onHitEffects = computeTowerOnHitEffects(tower.type, tower.level);
        tower._effectsLevel = tower.level;
    }
}



// ---------------------------------------------
// Defense: статус‑эффекты (Stage-14)
// Сейчас используется один эффект: замедление (slow).
// ---------------------------------------------

function isEnemySlowed(enemy, now){
    return !!(enemy && enemy.slowUntil && now < enemy.slowUntil);
}

function getEnemySpeedMul(enemy, now){
    if (!enemy) return 1;
    if (isEnemySlowed(enemy, now)) return (enemy.slowMul || 1);

    // очистка после окончания эффекта
    if (enemy.slowUntil && now >= enemy.slowUntil) {
        enemy.slowUntil = 0;
        enemy.slowMul = 1;
    }
    return 1;
}

function applySlowEffect(enemy, mult, durationMs, now){
    if (!enemy || enemy.health <= 0) return;

    const m = Number(mult);
    const mm = Number.isFinite(m) ? m : 0.75;
    const dur = Math.max(150, Math.round(Number(durationMs) || 900));
    const until = now + dur;

    // Сильнее = меньше множитель. Берём «самый сильный» и «самый долгий».
    enemy.slowMul = Math.min(enemy.slowMul || 1, mm);
    enemy.slowUntil = Math.max(enemy.slowUntil || 0, until);
}

function applyEffectsToEnemy(enemy, effects, now){
    if (!enemy || enemy.health <= 0) return;
    if (!Array.isArray(effects) || !effects.length) return;

    for (const eff of effects){
        if (!eff || typeof eff !== 'object') continue;

        if (eff.type === 'slow'){
            applySlowEffect(enemy, eff.mult, eff.durationMs, now);
        }
    }
}

// ---------------------------------------------
// Defense: выбор цели по приоритету (Stage-14)
// first / last / strongest / nearest
// ---------------------------------------------

function pickTargetForTower(tower, towerType){
    if (!tower || !towerType) return null;

    const base = towerTypes[tower.type] || towerTypes[0];
    const mode = tower.targeting || (base && base.targetingDefault) || 'nearest';
    const range = towerType.range;

    let best = null;
    let bestDist = Infinity;
    let bestX = -Infinity; // for first
    let worstX = Infinity; // for last
    let bestHp = -Infinity; // for strongest

    for (const enemy of gameState.enemies){
        if (!enemy || enemy.health <= 0) continue;

        const dist = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
        if (dist > range) continue;

        if (mode === 'nearest'){
            if (dist < bestDist){
                best = enemy;
                bestDist = dist;
            }
            continue;
        }

        if (mode === 'first'){
            if (enemy.x > bestX || (enemy.x === bestX && dist < bestDist)){
                best = enemy;
                bestX = enemy.x;
                bestDist = dist;
            }
            continue;
        }

        if (mode === 'last'){
            if (enemy.x < worstX || (enemy.x === worstX && dist < bestDist)){
                best = enemy;
                worstX = enemy.x;
                bestDist = dist;
            }
            continue;
        }

        if (mode === 'strongest'){
            if (enemy.health > bestHp || (enemy.health === bestHp && enemy.x > bestX)){
                best = enemy;
                bestHp = enemy.health;
                bestX = enemy.x;
                bestDist = dist;
            }
            continue;
        }

        // fallback
        if (dist < bestDist){
            best = enemy;
            bestDist = dist;
        }
    }

    return best;
}

function getUpgradeCost(tower){
    const base = towerTypes[tower.type] || towerTypes[0];
    const baseCost = base ? Number(base.cost) : 0;
    const lvl = tower.level || 1;
    if (lvl >= 3) return 0;

    // 1->2 дешевле, 2->3 дороже (настраивается в waves.json)
    const econ = (DEFENSE_BALANCE && DEFENSE_BALANCE.economy) ? DEFENSE_BALANCE.economy : DEFAULT_DEFENSE_BALANCE.economy;
    const mul2 = (econ && econ.upgradeCostMul && Number.isFinite(Number(econ.upgradeCostMul.to2))) ? Number(econ.upgradeCostMul.to2) : 0.6;
    const mul3 = (econ && econ.upgradeCostMul && Number.isFinite(Number(econ.upgradeCostMul.to3))) ? Number(econ.upgradeCostMul.to3) : 0.9;

    return Math.round(baseCost * (lvl === 1 ? mul2 : mul3));
}

function getSellRefund(tower){
    const spent = (tower && tower.spent != null) ? tower.spent : 0;
    const econ = (DEFENSE_BALANCE && DEFENSE_BALANCE.economy) ? DEFENSE_BALANCE.economy : DEFAULT_DEFENSE_BALANCE.economy;
    const mul = (econ && Number.isFinite(Number(econ.sellRefundMul))) ? Number(econ.sellRefundMul) : 0.7;
    return Math.max(0, Math.round(spent * mul));
}

function updateDefenseHUD(){
    const healthEl = document.getElementById('health');
    const resEl = document.getElementById('resources');
    const waveEl = document.getElementById('wave');
    const leftEl = document.getElementById('enemiesLeft');

    if (healthEl) healthEl.textContent = String(gameState.health);
    if (resEl) resEl.textContent = String(gameState.resources);
    if (waveEl) waveEl.textContent = String(gameState.wave);
    if (leftEl) {
        leftEl.textContent = String(gameState.enemiesRemaining || 0);
        // Убираем «Осталось: 0» когда волна не активна — меньше визуального шума.
        const leftItem = leftEl.closest('.stat-item');
        if (leftItem) {
            const waveActive = (gameState.spawnQueue && gameState.spawnQueue.length > 0) ||
                             (gameState.enemies && gameState.enemies.length > 0) ||
                             ((gameState.enemiesRemaining || 0) > 0);
            leftItem.style.display = waveActive ? '' : 'none';
        }
    }

    updateDefenseControlButtons();
}

function updateDefenseControlButtons(){
    const pauseBtn = document.getElementById('pauseBtn');
    const speedBtn = document.getElementById('speedBtn');

    if (pauseBtn){
        const paused = !!gameState.paused;
        pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
        pauseBtn.textContent = paused ? '▶' : '⏸';
        pauseBtn.title = paused ? 'Продолжить (P)' : 'Пауза (P)';
    }

    if (speedBtn){
        const x2 = (gameState.timeScale || 1) > 1;
        speedBtn.setAttribute('aria-pressed', x2 ? 'true' : 'false');
        speedBtn.textContent = x2 ? '⏩ x2' : '⏩ x1';
        speedBtn.title = x2 ? 'Скорость: ×2 (X)' : 'Скорость: ×1 (X)';
    }
}

function toggleDefensePause(){
    if (!gameState || gameState.mode !== 'defense') return;
    gameState.paused = !gameState.paused;
    updateDefenseControlButtons();
    showToast(gameState.paused ? '⏸ Пауза' : '▶ Продолжить', 'info');
}

function toggleDefenseSpeed(){
    if (!gameState || gameState.mode !== 'defense') return;
    gameState.timeScale = (gameState.timeScale || 1) > 1 ? 1 : 2;
    updateDefenseControlButtons();
    showToast(gameState.timeScale > 1 ? '⏩ Скорость ×2' : '⏩ Скорость ×1', 'info');
}

function clearPlacementSelection(options = {}){
    const { silent = false } = options;

    hidePlacementHint();

    gameState.selectedTower = null;
    if (gameState.pointer) gameState.pointer.active = false;
    gameState.placement = { ok: false, reason: '' };

    document.querySelectorAll('.tower-card').forEach(card => {
        card.classList.remove('selected');
        card.style.transform = 'scale(1)';
        card.style.boxShadow = 'none';
    });

    if (!silent) showToast('🛑 Выбор башни отменён', 'info');
}

function closeTowerActions(){
    gameState.selectedPlacedTower = null;
    const panel = document.getElementById('towerActions');
    if (panel){
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        panel.innerHTML = '';
    }
}

function getTowerAt(x, y){
    const r = 26;
    for (let i = gameState.towers.length - 1; i >= 0; i--){
        const t = gameState.towers[i];
        const dist = Math.hypot(t.x - x, t.y - y);
        if (dist <= r) return i;
    }
    return -1;
}

function selectPlacedTower(index){
    if (index == null || index < 0 || index >= gameState.towers.length) return;

    // Если был выбран тип для установки — отменяем (без лишних тостов)
    if (gameState.selectedTower !== null) clearPlacementSelection({ silent: true });

    gameState.selectedPlacedTower = index;
    renderTowerActions();
}

function renderTowerActions(){
    const idx = gameState.selectedPlacedTower;
    const panel = document.getElementById('towerActions');
    if (!panel || idx == null) return;

    const t = gameState.towers[idx];
    if (!t) return;

    ensureTowerRuntimeFields(t);
    const base = towerTypes[t.type] || towerTypes[0];

    const upgradeCost = getUpgradeCost(t);
    const canUpgrade = t.level < 3;
    const refund = getSellRefund(t);

    const targetingOptions = [
        { key: 'first', label: 'Первый' },
        { key: 'last', label: 'Последний' },
        { key: 'strongest', label: 'Сильнейший' },
        { key: 'nearest', label: 'Ближайший' }
    ];

    const currentTargeting = (targetingOptions.some(o => o.key === t.targeting) ? t.targeting : (base && base.targetingDefault) ? base.targetingDefault : 'nearest');

    const targetingButtons = targetingOptions.map(o => {
        const active = (o.key === currentTargeting) ? 'is-active' : '';
        return `<button type="button" class="segmented-btn ${active}" data-targeting="${o.key}" aria-pressed="${o.key === currentTargeting ? 'true' : 'false'}">${o.label}</button>`;
    }).join('');

    const slowEff = Array.isArray(t.onHitEffects) ? t.onHitEffects.find(e => e && e.type === 'slow') : null;
    const slowNote = slowEff
        ? `🧊 Попадание замедляет цель: −${Math.round((1 - slowEff.mult) * 100)}% на ${(slowEff.durationMs / 1000).toFixed(1)}с`
        : '';

    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');

    panel.innerHTML = `
        <div class="tower-actions-header">
            <div>
                <div class="tower-actions-title">${base.icon} ${base.name} — уровень ${t.level}/3</div>
                <div class="tower-actions-sub">Апгрейды усиливают урон/радиус/скорость • Esc/клик по полю — закрыть</div>
            </div>
            <button type="button" class="tower-actions-close" id="towerActionsClose" aria-label="Закрыть">✕</button>
        </div>

        <div class="tower-actions-grid">
            <div class="tower-actions-chip">
                <span class="label">📏 Дальность</span>
                <span class="value">${t.range}</span>
            </div>
            <div class="tower-actions-chip">
                <span class="label">💥 Урон</span>
                <span class="value">${t.damage}</span>
            </div>
            <div class="tower-actions-chip">
                <span class="label">⚡ Скорость</span>
                <span class="value">${Number(t.firerate).toFixed(1)}/сек</span>
            </div>
            <div class="tower-actions-chip">
                <span class="label">💸 Продажа</span>
                <span class="value">+${refund}</span>
            </div>
        </div>

        <div class="tower-actions-target">
            <div class="tower-actions-target-label">🎯 Приоритет цели</div>
            <div class="segmented" role="radiogroup" aria-label="Приоритет цели">
                ${targetingButtons}
            </div>
            ${slowNote ? `<div class="tower-actions-note">${slowNote}</div>` : ''}
        </div>

        <div class="tower-actions-buttons">
            <button type="button" class="tower-actions-btn" id="towerUpgradeBtn" ${canUpgrade ? '' : 'disabled'}>
                ⬆ Улучшить ${canUpgrade ? `(−${upgradeCost})` : ''}
            </button>
            <button type="button" class="tower-actions-btn tower-actions-btn--danger" id="towerSellBtn">
                💰 Продать (+${refund})
            </button>
        </div>
    `;

    const closeBtn = document.getElementById('towerActionsClose');
    if (closeBtn){
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeTowerActions();
        });
    }

    panel.querySelectorAll('[data-targeting]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const mode = btn.getAttribute('data-targeting') || 'nearest';
            t.targeting = mode;
            renderTowerActions(); // обновляем active state
        });
    });

    const upgradeBtn = document.getElementById('towerUpgradeBtn');
    if (upgradeBtn){
        upgradeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            upgradeTowerAt(idx);
        });
    }

    const sellBtn = document.getElementById('towerSellBtn');
    if (sellBtn){
        sellBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sellTowerAt(idx);
        });
    }
}

function upgradeTowerAt(index){
    const t = gameState.towers[index];
    if (!t) return;
    ensureTowerRuntimeFields(t);

    if (t.level >= 3){
        showToast('ℹ️ Максимальный уровень', 'info');
        return;
    }

    const cost = getUpgradeCost(t);
    if (gameState.resources < cost){
        showToast('⚠️ Недостаточно ресурсов для улучшения', 'error');
        return;
    }

    gameState.resources -= cost;
    t.level += 1;
    t.spent = (t.spent || 0) + cost;

    const st = computeTowerStats(t.type, t.level);
    t.range = st.range;
    t.damage = st.damage;
    t.firerate = st.firerate;

    updateDefenseHUD();
    renderTowerActions();
    showToast(`⬆ Улучшено до уровня ${t.level}`, 'success');
}

function sellTowerAt(index){
    const t = gameState.towers[index];
    if (!t) return;
    ensureTowerRuntimeFields(t);

    const refund = getSellRefund(t);
    gameState.resources += refund;

    gameState.towers.splice(index, 1);

    // корректируем выбранный индекс
    if (gameState.selectedPlacedTower != null){
        if (index === gameState.selectedPlacedTower){
            closeTowerActions();
        } else if (index < gameState.selectedPlacedTower){
            gameState.selectedPlacedTower -= 1;
            renderTowerActions();
        }
    }

    updateDefenseHUD();
    showToast(`💸 Башня продана (+${refund})`, 'info');
}

// =============================================
// Placement hint (UX): shows why the tower can't be placed
// =============================================
let _placementHintEl = null;

function ensurePlacementHint(){
    if (_placementHintEl && _placementHintEl.isConnected) return _placementHintEl;
    _placementHintEl = document.getElementById('placementHint');
    if (!_placementHintEl){
        _placementHintEl = document.createElement('div');
        _placementHintEl.id = 'placementHint';
        _placementHintEl.className = 'placement-hint';
        _placementHintEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(_placementHintEl);
    }
    return _placementHintEl;
}

function hidePlacementHint(){
    const el = ensurePlacementHint();
    if (!el) return;
    el.classList.remove('is-visible', 'is-ok');
    el.setAttribute('aria-hidden', 'true');
}

function updatePlacementHint(canvas, x, y, validation, towerType){
    if (!canvas || !towerType) return;
    const el = ensurePlacementHint();
    if (!el) return;

    // Не показываем подсказку, если ничего не выбрано
    if (gameState.selectedTower === null){
        hidePlacementHint();
        return;
    }

    const ok = !!(validation && validation.ok);
    const reason = (validation && validation.reason) ? String(validation.reason) : '';

    // Показываем и позитивный вариант, и причину запрета (это сильно помогает на телефоне)
    const text = ok
        ? `✅ Можно поставить (−${towerType.cost})`
        : `🚫 ${reason || 'Нельзя поставить здесь'}`;

    el.textContent = text;
    el.classList.toggle('is-ok', ok);

    const rect = canvas.getBoundingClientRect();
    const px = rect.left + x;
    const py = rect.top + y;

    // Clamp so it doesn't go off-screen
    const m = 14;
    const left = Math.max(m, Math.min(window.innerWidth - m, px));
    const top  = Math.max(m, Math.min(window.innerHeight - m, py));

    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;

    el.classList.add('is-visible');
    el.setAttribute('aria-hidden', 'false');
}

function getPlacementValidation(x, y, towerType){
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return { ok: false, reason: 'Нет поля' };

    const margin = 28;
    if (x < margin || y < margin || x > canvas.width - margin || y > canvas.height - margin){
        return { ok: false, reason: 'Слишком близко к краю' };
    }

    const noBuild = 60;
    if (x < noBuild) return { ok: false, reason: 'Зона входа целей' };
    if (x > canvas.width - noBuild) return { ok: false, reason: 'Зона выхода целей' };

    if (gameState.resources < towerType.cost){
        return { ok: false, reason: 'Недостаточно ресурсов' };
    }

    const tooClose = gameState.towers.some(t => Math.hypot(t.x - x, t.y - y) < 50);
    if (tooClose){
        return { ok: false, reason: 'Слишком близко к другой башне' };
    }

    return { ok: true, reason: '' };
}

function updatePlacementPreview(x, y){
    if (gameState.selectedTower === null) return;
    const towerType = towerTypes[gameState.selectedTower];

    gameState.pointer.x = x;
    gameState.pointer.y = y;
    gameState.pointer.active = true;

    gameState.placement = getPlacementValidation(x, y, towerType);
}

function initDefenseGame() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Адаптивность
    syncCanvasToCssSize(canvas);
    attachDefenseResizeHandler(canvas);

    // Полный ресет состояния полигона (на случай повторного входа)
    const econ = (DEFENSE_BALANCE && DEFENSE_BALANCE.economy) ? DEFENSE_BALANCE.economy : DEFAULT_DEFENSE_BALANCE.economy;
    gameState.health = Number(econ.startHealth) || 100;
    gameState.resources = Number(econ.startResources) || 1500;
    gameState.wave = 1;

    gameState.towers = [];
    gameState.enemies = [];
    gameState.effects = [];
    gameState.projectiles = [];

    gameState.spawnQueue = [];
    gameState.spawnTimeouts = [];

    gameState.enemiesRemaining = 0;
    gameState.enemiesTotal = 0;

    gameState.selectedTower = null;
    gameState.selectedPlacedTower = null;

    gameState.pointer = { x: 0, y: 0, active: false };
    gameState.placement = { ok: false, reason: '' };

    gameState.paused = false;
    gameState.timeScale = 1;
    gameState.defenseTime = 0;
    gameState._lastFrameTime = Date.now();

    // Stage-13: run stats + game over flag
    gameState._isGameOver = false;
    gameState.runStats = {
        startedAt: Date.now(),
        kills: 0,
        leaks: 0,
        wavesCompleted: 0,
        reward: 0
    };

    // Скрываем экран поражения, если он вдруг остался
    closeDefenseGameOver({ force: true });

    gameState.waveStats = null;
    gameState.waveSummaryShown = false;

    // Скрываем факт при старте
    const factEl = document.getElementById('historicalFact');
    if (factEl) factEl.classList.add('hidden');

    // Сбрасываем summary прошлой волны
    const wsEl = document.getElementById('waveSummary');
    if (wsEl) wsEl.textContent = '';

    // Mobile tabs: факт ещё не показан, возвращаемся на «Башни»
    resetDefenseFactBadge();
    setDefenseSheetTab('towers', { silent: true });

    closeTowerActions();

    // HUD / кнопки
    updateDefenseHUD();

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.onclick = () => toggleDefensePause();
    const speedBtn = document.getElementById('speedBtn');
    if (speedBtn) speedBtn.onclick = () => toggleDefenseSpeed();

    // Панель выбора башен
    const towerPanel = document.getElementById('towerPanel');
    if (towerPanel) {
        towerPanel.innerHTML = '';

        towerTypes.forEach((tower, index) => {
            const card = document.createElement('div');
            card.className = 'tower-card';

            card.innerHTML = `
                <div class="tower-header">
                    <span class="tower-icon">${tower.icon}</span>
                    <div class="tower-name">${tower.name}</div>
                </div>
                <div class="tower-stats">
                    <div class="stat">📏 Дальность: ${tower.range}</div>
                    <div class="stat">💥 Урон: ${tower.damage}</div>
                    <div class="stat">⚡ Скорость: ${tower.firerate}</div>
                    ${tower.effects && tower.effects.slow ? `<div class="stat">🧊 Эффект: замедление</div>` : ''}
                </div>
                <div class="tower-history">${tower.history}</div>
                <div class="tower-cost">💰 Стоимость: ${tower.cost}</div>
            `;

            card.addEventListener('click', () => selectTower(index));
            towerPanel.appendChild(card);
        });
    }

    // Управление мышью/тачем по канвасу
    // Отключаем контекстное меню, чтобы ПКМ работала как «Отмена»
    canvas.oncontextmenu = (e) => {
        e.preventDefault();
        return false;
    };

    canvas.onpointermove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // сохраняем для превью
        gameState.pointer.x = x;
        gameState.pointer.y = y;

        if (gameState.selectedTower !== null) {
            updatePlacementPreview(x, y);
            // Мобильный UX: показываем, почему можно/нельзя поставить
            updatePlacementHint(canvas, x, y, gameState.placement, towerTypes[gameState.selectedTower]);
        } else {
            hidePlacementHint();
        }
    };

    canvas.onpointerleave = () => {
        if (gameState.pointer) gameState.pointer.active = false;
        hidePlacementHint();
    };

    canvas.onpointerdown = (e) => {
        // ПКМ — отмена выбора/закрытие панели
        if (e.button === 2) {
            e.preventDefault();
            if (gameState.selectedTower !== null) {
                clearPlacementSelection();
            } else if (gameState.selectedPlacedTower != null) {
                closeTowerActions();
            }
            return;
        }

        if (e.button !== 0) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 1) Если выбран тип башни — пытаемся поставить
        if (gameState.selectedTower !== null) {
            placeTower(x, y);
            return;
        }

        // 2) Если кликнули по башне — открываем апгрейд/продажу
        const idx = getTowerAt(x, y);
        if (idx >= 0) {
            selectPlacedTower(idx);
            return;
        }

        // 3) Иначе — закрываем панель действий
        closeTowerActions();
    };

    // Запускаем игровой цикл
    if (gameState.gameLoop) cancelAnimationFrame(gameState.gameLoop);
    gameState.gameLoop = requestAnimationFrame(() => gameLoop(ctx, canvas));

    // Обучение показывается только при первом запуске — дальше его можно открыть из справки
    openDefenseTutorial({ onDone: () => startWave() });
}


function selectTower(index) {
    // Повторный клик по выбранной карточке — отмена
    if (gameState.selectedTower === index) {
        clearPlacementSelection({ silent: true });
        return;
    }

    closeTowerActions();

    gameState.selectedPlacedTower = null;
    gameState.selectedTower = index;
    if (gameState.pointer) gameState.pointer.active = false;

    document.querySelectorAll('.tower-card').forEach((card, i) => {
        if (i === index) {
            card.classList.add('selected');
            card.style.transform = 'scale(1.05)';
            card.style.boxShadow = '0 0 25px rgba(201, 176, 122, 0.4)';
        } else {
            card.classList.remove('selected');
            card.style.transform = 'scale(1)';
            card.style.boxShadow = 'none';
        }
    });
}


function placeTower(x, y) {
    const typeIndex = gameState.selectedTower;
    if (typeIndex === null) return;

    const towerType = towerTypes[typeIndex];
    if (!towerType) return;

    const v = getPlacementValidation(x, y, towerType);
    if (!v.ok) {
        showToast(`🚫 ${v.reason}`, 'error');
        return;
    }

    const st = computeTowerStats(typeIndex, 1);

    gameState.towers.push({
        x,
        y,
        type: typeIndex,
        lastFire: 0,
        rotation: 0,
        level: 1,
        spent: towerType.cost,
        range: st.range,
        damage: st.damage,
        firerate: st.firerate
    });

    gameState.resources -= towerType.cost;
    updateDefenseHUD();

    // Сбрасываем выбор (как и раньше) — один клик = одна установка
    clearPlacementSelection({ silent: true });

    showToast(`${towerType.icon} ${towerType.name} установлена`, 'success');
}


function showToast(message, kind = 'error') {
    const toast = document.createElement('div');
    const cls = ['toast'];
    if (kind === 'success') cls.push('toast--success');
    if (kind === 'info') cls.push('toast--info');
    toast.className = cls.join(' ');
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2200);
}

// Toast с кнопкой действия (например «Обновить» для PWA)
function showToastAction(message, actionText, onAction, kind = 'info', duration = 9000, onClose = null){
    const toast = document.createElement('div');
    const cls = ['toast', 'toast--action'];
    if (kind === 'success') cls.push('toast--success');
    if (kind === 'info') cls.push('toast--info');
    toast.className = cls.join(' ');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const text = document.createElement('span');
    text.textContent = message;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = String(actionText || 'OK');

    const remove = () => {
        if (toast && toast.parentNode) toast.remove();
        if (typeof onClose === 'function') {
            try { onClose(); } catch (_) {}
        }
    };

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            if (typeof onAction === 'function') onAction();
        } finally {
            remove();
        }
    });

    toast.appendChild(text);
    toast.appendChild(btn);

    // Продлеваем анимацию появления/исчезновения под duration
    const ms = Math.max(1500, Number(duration) || 9000);
    toast.style.animation = `toastPop ${ms}ms ease forwards`;

    document.body.appendChild(toast);

    setTimeout(remove, ms + 120);
    return toast;
}

function showAlert(message) {
    showToast(message, 'error');
}


function startWave() {
    const wave = gameState.wave || 1;
    const baseEnemies = 3 + wave * 2;
    const bossCount = (wave % 5 === 0) ? 1 : 0;
    const numEnemies = baseEnemies + bossCount;

    gameState.enemiesRemaining = numEnemies;
    gameState.enemiesTotal = numEnemies;

    // очередь спавна — привязана к "внутреннему" времени симуляции (для паузы/ускорения)
    gameState.spawnQueue = [];

    const types = { standard: 0, fast: 0, armored: 0, boss: 0 };

    gameState.waveStats = {
        wave,
        startHealth: gameState.health,
        kills: 0,
        leaks: 0,
        total: numEnemies,
        reward: 0,
        types
    };
    gameState.waveSummaryShown = false;

    const baseTime = gameState.defenseTime || 0;
    const spawnEvery = 780;

    // Спавн по высоте: подстраиваемся под реальный размер поля (важно для смартфонов)
    const canvas = document.getElementById('gameCanvas');
    const ch = canvas ? canvas.height : 600;
    const yPad = Math.max(50, Math.round(ch * 0.18));
    const yMin = yPad;
    const yMax = Math.max(yMin + 20, ch - yPad);

    // Обычные цели
    for (let i = 0; i < baseEnemies; i++) {
        const kind = pickEnemyKindForWave(wave);
        const st = computeEnemyStats(kind, wave);
        types[kind] = (types[kind] || 0) + 1;

        gameState.spawnQueue.push({
            at: baseTime + i * spawnEvery,
            x: -50,
            y: yMin + Math.random() * (yMax - yMin),
            ...st
        });
    }

    // Босс: каждая 5-я волна (в конце)
    if (bossCount) {
        const st = computeEnemyStats('boss', wave);
        types.boss = (types.boss || 0) + 1;

        const bossAt = baseTime + baseEnemies * spawnEvery + 1100;
        const y = yMin + (0.25 + Math.random() * 0.5) * (yMax - yMin);
        gameState.spawnQueue.push({
            at: bossAt,
            x: -70,
            y,
            ...st
        });
    }

    // На всякий случай: сортируем по времени
    gameState.spawnQueue.sort((a, b) => a.at - b.at);

    updateDefenseHUD();
}


function nextWave() {
    const factEl = document.getElementById('historicalFact');
    if (factEl) factEl.classList.add('hidden');

    // Сбрасываем summary прошлой волны
    const wsEl = document.getElementById('waveSummary');
    if (wsEl) wsEl.textContent = '';

    // Mobile tabs: возвращаемся к панели башен
    if (isDefenseSheetEnabled()) setDefenseSheetTab('towers', { silent: true });
    resetDefenseFactBadge();
    // Сбрасываем состояние «Читать далее» для факта
    if (window.FactReadMore && typeof window.FactReadMore.collapse === 'function') {
        window.FactReadMore.collapse();
    }

    gameState.wave++;
    updateDefenseHUD();

    startWave();
}


/**
 * «Умная плотность» для блока исторического факта: текст по умолчанию
 * свёрнут и раскрывается по кнопке «Читать далее». Если текст короткий
 * и помещается целиком — кнопка скрывается.
 */
function initFactReadMore() {
    const toggle = document.getElementById('factToggle');
    const content = document.getElementById('factContent');
    if (!toggle || !content) return;

    const setExpanded = (expanded) => {
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggle.textContent = expanded ? 'Свернуть' : 'Читать далее';
        content.classList.toggle('fact-collapsed', !expanded);
    };

    const refresh = () => {
        // По умолчанию держим компактно
        setExpanded(false);
        // Дадим браузеру применить высоты/кламп
        requestAnimationFrame(() => {
            const full = content.scrollHeight;
            const visible = content.clientHeight;
            const hasMore = full > visible + 4;

            toggle.style.display = hasMore ? 'inline-flex' : 'none';
            if (!hasMore) {
                // Если текста мало — показываем полностью и не отвлекаем кнопкой
                content.classList.remove('fact-collapsed');
            }
        });
    };

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        setExpanded(!expanded);
    });

    // Экспортируем наружу, чтобы вызывать при показе факта
    window.FactReadMore = {
        refresh,
        collapse: () => {
            setExpanded(false);
            toggle.style.display = 'inline-flex';
        }
    };

    // На ресайзах пересчитываем: чтобы на планшетах/при изменении окна
    // «читать далее» появлялось/исчезало корректно.
    let t;
    window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => {
            const factBox = document.getElementById('historicalFact');
            if (factBox && !factBox.classList.contains('hidden')) {
                refresh();
            }
        }, 120);
    });
}


// =============================================
// Defense mobile sheet (Tabs: Башни / Факт)
// =============================================
let _defenseSheetInited = false;

function isDefenseSheetEnabled(){
    try{
        return !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
    }catch(_){
        return false;
    }
}

function initDefenseSheetTabs(){
    if (_defenseSheetInited) return;

    const tabTowers = document.getElementById('sheetTabTowers');
    const tabFact = document.getElementById('sheetTabFact');
    const panelTowers = document.getElementById('sheetPanelTowers');
    const panelFact = document.getElementById('sheetPanelFact');

    if (!tabTowers || !tabFact || !panelTowers || !panelFact) return;

    _defenseSheetInited = true;

    tabTowers.addEventListener('click', (e) => {
        e.preventDefault();
        setDefenseSheetTab('towers');
    });

    tabFact.addEventListener('click', (e) => {
        e.preventDefault();
        setDefenseSheetTab('fact');
    });

    // Стартовое состояние
    setDefenseSheetTab('towers', { silent: true });
}

function setDefenseSheetTab(tab, options = {}){
    const { silent = false } = options;

    const tabTowers = document.getElementById('sheetTabTowers');
    const tabFact = document.getElementById('sheetTabFact');
    const panelTowers = document.getElementById('sheetPanelTowers');
    const panelFact = document.getElementById('sheetPanelFact');

    if (!tabTowers || !tabFact || !panelTowers || !panelFact) return;

    const isFact = tab === 'fact';

    tabTowers.classList.toggle('is-active', !isFact);
    tabFact.classList.toggle('is-active', isFact);

    tabTowers.setAttribute('aria-selected', isFact ? 'false' : 'true');
    tabFact.setAttribute('aria-selected', isFact ? 'true' : 'false');

    panelTowers.classList.toggle('is-active', !isFact);
    panelFact.classList.toggle('is-active', isFact);

    // Если пользователь открыл вкладку «Факт» — снимаем подсветку
    if (isFact) {
        tabFact.classList.remove('has-new');
    }

    if (!silent) {
        // Маленький тактильный "отклик" для мобильных
        if (navigator.vibrate) {
            try { navigator.vibrate(12); } catch (_) {}
        }
    }
}

function markDefenseFactAvailable(){
    const tabFact = document.getElementById('sheetTabFact');
    if (tabFact) tabFact.classList.add('has-new');
}

function resetDefenseFactBadge(){
    const tabFact = document.getElementById('sheetTabFact');
    if (tabFact) tabFact.classList.remove('has-new');
}


// =============================================
// Defense mobile sheet (Drag: snap heights)
// =============================================
let _defenseSheetDragInited = false;

function getDefenseSheetDefaults(){
    const isPhone = (() => {
        try { return window.matchMedia && window.matchMedia('(max-width: 700px)').matches; } catch (_) { return false; }
    })();

    return {
        defaultVh: isPhone ? 46 : 42,
        snaps: isPhone ? [28, 46, 74] : [24, 42, 68],
        minVh: isPhone ? 22 : 20,
        maxVh: isPhone ? 78 : 74
    };
}

function initDefenseSheetDrag(){
    if (_defenseSheetDragInited) return;

    const sheet = document.getElementById('defenseSheet');
    const handle = document.getElementById('defenseSheetHandle');
    if (!sheet || !handle) return;

    _defenseSheetDragInited = true;

    const applyVh = (vh, options = {}) => {
        const { silent = false } = options;
        sheet.style.setProperty('--sheetVh', String(Math.round(vh)));
        if (!silent && navigator.vibrate){
            try { navigator.vibrate(10); } catch (_) {}
        }
    };

    // Стартовая высота (синхронизируем с CSS-дефолтом)
    applyVh(getDefenseSheetDefaults().defaultVh, { silent: true });

    let dragging = false;
    let startY = 0;
    let startVh = 0;

    const getCurrentVh = () => {
        const raw = getComputedStyle(sheet).getPropertyValue('--sheetVh');
        const v = parseFloat(raw);
        return Number.isFinite(v) ? v : getDefenseSheetDefaults().defaultVh;
    };

    const snapToNearest = () => {
        const { snaps } = getDefenseSheetDefaults();
        const cur = getCurrentVh();
        let nearest = snaps[0];
        for (const s of snaps){
            if (Math.abs(s - cur) < Math.abs(nearest - cur)) nearest = s;
        }
        applyVh(nearest);
    };

    const onDown = (e) => {
        if (!isDefenseSheetEnabled()) return;
        dragging = true;
        sheet.classList.add('is-dragging');
        startY = e.clientY;
        startVh = getCurrentVh();
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
    };

    const onMove = (e) => {
        if (!dragging) return;
        const { minVh, maxVh } = getDefenseSheetDefaults();

        const dy = e.clientY - startY;
        const deltaVh = (dy / Math.max(1, window.innerHeight)) * 100;
        let next = startVh - deltaVh;
        next = Math.max(minVh, Math.min(maxVh, next));
        sheet.style.setProperty('--sheetVh', next.toFixed(1));
        e.preventDefault();
    };

    const onUp = (e) => {
        if (!dragging) return;
        dragging = false;
        sheet.classList.remove('is-dragging');
        snapToNearest();
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
    handle.addEventListener('lostpointercapture', onUp);

    // Клавиатурный UX: Enter/Space переключает между «средней» и «расширенной» высотой
    handle.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const { snaps } = getDefenseSheetDefaults();
        const cur = getCurrentVh();
        const mid = snaps[Math.floor(snaps.length / 2)];
        const max = snaps[snaps.length - 1];
        applyVh(Math.abs(cur - mid) < 3 ? max : mid);
    });

    // На ресайзе просто проверяем границы
    window.addEventListener('resize', () => {
        if (!isDefenseSheetEnabled()) return;
        const { minVh, maxVh } = getDefenseSheetDefaults();
        const cur = getCurrentVh();
        const clamped = Math.max(minVh, Math.min(maxVh, cur));
        sheet.style.setProperty('--sheetVh', clamped.toFixed(1));
    }, { passive: true });
}


// ------------------------------------------------------------
// ВИЗУАЛЬНЫЕ ЭФФЕКТЫ ДЛЯ ПОЛИГОНА
// вспышки, маркеры целей, анимации выстрелов/снарядов
// ------------------------------------------------------------

function hexToRgb(hex) {
    if (!hex) return { r: 255, g: 255, b: 255 };
    let h = String(hex).trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 3) {
        h = h.split('').map(c => c + c).join('');
    }
    // На случай если в цвете уже есть альфа (например #RRGGBBAA) — обрежем до 6 символов.
    if (h.length > 6) h = h.slice(0, 6);
    const num = parseInt(h, 16);
    if (Number.isNaN(num)) return { r: 255, g: 255, b: 255 };
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function rgba(rgb, a) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function pushEffect(effect) {
    if (!Array.isArray(gameState.effects)) gameState.effects = [];
    gameState.effects.push(effect);
    // Ограничиваем размер массива эффектов, чтобы не падал FPS на слабых устройствах
    const limit = 260;
    if (gameState.effects.length > limit) {
        gameState.effects.splice(0, gameState.effects.length - limit);
    }
}

function pushProjectile(p) {
    if (!Array.isArray(gameState.projectiles)) gameState.projectiles = [];
    gameState.projectiles.push(p);
    const limit = 60;
    if (gameState.projectiles.length > limit) {
        gameState.projectiles.splice(0, gameState.projectiles.length - limit);
    }
}

function spawnSparks(x, y, rgb, now, count = 10) {
    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 70 + Math.random() * 160;
        pushEffect({
            kind: 'particle',
            x,
            y,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            rgb,
            t0: now,
            duration: 260 + Math.random() * 220,
            size: 1.2 + Math.random() * 2.4
        });
    }
}

function spawnSmokePuff(x, y, now, strength = 1) {
    // Лёгкий дымовой клуб (серо‑голубой), чтобы не перегружать FPS.
    // Слегка дрейфует вверх и в сторону.
    const ang = (-Math.PI / 2) + (Math.random() - 0.5) * 1.0;
    const sp = (12 + Math.random() * 26) * strength;
    const driftX = Math.cos(ang) * sp;
    const driftY = Math.sin(ang) * sp;
    pushEffect({
        kind: 'smoke',
        x,
        y,
        vx: driftX,
        vy: driftY,
        t0: now,
        duration: 950 + Math.random() * 450,
        r0: 6 + Math.random() * 6,
        r1: 22 + Math.random() * 18,
        a0: 0.22 + Math.random() * 0.10
    });
}

function spawnLaserShot(tower, enemy, towerType, now) {
    const rgb = hexToRgb(towerType.color);
    // Импульс/луч
    pushEffect({ kind: 'laser', x1: tower.x, y1: tower.y, x2: enemy.x, y2: enemy.y, rgb, t0: now, duration: 140, width: 4 });
    // Вспышки
    pushEffect({ kind: 'muzzle', x: tower.x, y: tower.y, rgb, t0: now, duration: 120, radius: 20 });
    pushEffect({ kind: 'hit', x: enemy.x, y: enemy.y, rgb, t0: now, duration: 220, radius: 12 });
    // Маркер цели
    pushEffect({ kind: 'target', x: enemy.x, y: enemy.y, rgb, t0: now, duration: 260, radius: 22 });
    // Искры
    spawnSparks(enemy.x, enemy.y, { r: 255, g: 255, b: 255 }, now, 8);
    spawnSparks(enemy.x, enemy.y, rgb, now, 6);
}

function spawnMissile(tower, enemy, towerType, now) {
    const rgb = hexToRgb(towerType.color);
    const dx = (enemy.x - tower.x);
    const dy = (enemy.y - tower.y);
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 560; // px/сек
    const life = Math.min(1600, (dist / speed) * 1000 + 250);

    pushProjectile({
        kind: 'missile',
        x: tower.x,
        y: tower.y,
        tx: enemy.x,
        ty: enemy.y,
        target: enemy,
        speed,
        rgb,
        damage: towerType.damage,
        onHitEffects: tower.onHitEffects,
        t0: now,
        life
    });

    // Вспышка пуска + маркер цели
    pushEffect({ kind: 'muzzle', x: tower.x, y: tower.y, rgb, t0: now, duration: 140, radius: 22 });
    pushEffect({ kind: 'target', x: enemy.x, y: enemy.y, rgb, t0: now, duration: 240, radius: 22 });
}

function drawMissile(ctx, p, dx, dy, now) {
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);

    // корпус
    ctx.shadowBlur = 10;
    ctx.shadowColor = rgba(p.rgb, 0.85);
    ctx.fillStyle = rgba(p.rgb, 0.95);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-8, 5);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, -5);
    ctx.closePath();
    ctx.fill();

    // пламя (мерцает)
    const flicker = 3 + Math.sin(now / 45) * 2;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 180, 80, 0.95)';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-14 - flicker, 3);
    ctx.lineTo(-12 - flicker, 0);
    ctx.lineTo(-14 - flicker, -3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function updateAndRenderCombatFX(ctx, now, dtMs) {
    const dt = Math.min(34, Math.max(0, (typeof dtMs === 'number' ? dtMs : 16)));
    const dtSec = dt / 1000;

    // --- Projectiles (анимации выстрелов) ---
    if (!Array.isArray(gameState.projectiles)) gameState.projectiles = [];
    const keptProjectiles = [];
    for (const p of gameState.projectiles) {
        const age = now - p.t0;
        if (age > p.life) continue;

        // Если цель жива — делаем лёгкое наведение (плавно обновляем координату цели)
        if (p.target && p.target.health > 0) {
            p.tx = p.target.x;
            p.ty = p.target.y;
        }

        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const step = p.speed * dtSec;

        if (dist <= step) {
            // попадание
            p.x = p.tx;
            p.y = p.ty;

            if (p.damage && p.target && p.target.health > 0) {
                const mul = (p.target && typeof p.target.dmgMul === 'number') ? p.target.dmgMul : 1;
                const dmg = Math.max(1, Math.round(p.damage * mul));
                p.target.health -= dmg;
            }

            // Stage-14: статус‑эффекты снаряда при попадании
            if (p.onHitEffects && p.target && p.target.health > 0) {
                applyEffectsToEnemy(p.target, p.onHitEffects, now);
            }

            // вспышка/взрыв
            pushEffect({ kind: 'explosion', x: p.x, y: p.y, rgb: p.rgb, t0: now, duration: 260, radius: 34 });
            // кольцевая ударная волна
            pushEffect({ kind: 'shockwave', x: p.x, y: p.y, rgb: p.rgb, t0: now, duration: 560, r0: 6, r1: 92, width: 3 });
            pushEffect({ kind: 'hit', x: p.x, y: p.y, rgb: p.rgb, t0: now, duration: 220, radius: 14 });
            pushEffect({ kind: 'target', x: p.x, y: p.y, rgb: p.rgb, t0: now, duration: 200, radius: 20 });
            spawnSparks(p.x, p.y, { r: 255, g: 255, b: 255 }, now, 10);
            spawnSparks(p.x, p.y, p.rgb, now, 10);
            // лёгкий дым после взрыва
            for (let s = 0; s < 4; s++) spawnSmokePuff(p.x, p.y, now, 1.1);
            continue;
        }

        // движение
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;

        // лёгкий след
        if (Math.random() < 0.55) {
            pushEffect({ kind: 'trail', x: p.x, y: p.y, rgb: p.rgb, t0: now, duration: 220, radius: 10 });
        }

        // дымовой след (редко, чтобы не перегружать)
        if (Math.random() < 0.18) {
            // чуть смещаем клуб назад по направлению полёта
            const backX = p.x - (dx / dist) * 10;
            const backY = p.y - (dy / dist) * 10;
            spawnSmokePuff(backX, backY, now, 1);
        }
        // рисуем ракету
        drawMissile(ctx, p, dx, dy, now);

        keptProjectiles.push(p);
    }
    gameState.projectiles = keptProjectiles;

    // --- Effects (вспышки/лучи/маркеры/частицы) ---
    if (!Array.isArray(gameState.effects)) gameState.effects = [];
    const kept = [];
    for (const e of gameState.effects) {
        const age = now - e.t0;
        const p = age / e.duration;
        if (p >= 1) continue;

        if (e.kind === 'laser') {
            const a = 1 - p;
            ctx.save();
            ctx.globalAlpha = 0.9 * a;
            ctx.lineWidth = (e.width || 4) * (0.8 + 0.4 * a);
            ctx.strokeStyle = rgba(e.rgb, 1);
            ctx.shadowBlur = 18 * a;
            ctx.shadowColor = rgba(e.rgb, 0.95);
            ctx.setLineDash([14, 18]);
            ctx.lineDashOffset = -age / 12;
            ctx.beginPath();
            ctx.moveTo(e.x1, e.y1);
            ctx.lineTo(e.x2, e.y2);
            ctx.stroke();
            ctx.setLineDash([]);
            // яркое ядро
            ctx.globalAlpha = 0.25 * a;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(e.x1, e.y1);
            ctx.lineTo(e.x2, e.y2);
            ctx.stroke();
            ctx.restore();
        } else if (e.kind === 'muzzle') {
            const a = 1 - p;
            const r = (e.radius || 18) * (0.65 + p);
            ctx.save();
            ctx.globalAlpha = 0.95 * a;
            const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
            g.addColorStop(0, rgba(e.rgb, 0.9 * a));
            g.addColorStop(0.6, rgba(e.rgb, 0.25 * a));
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (e.kind === 'trail') {
            const a = 1 - p;
            const r = (e.radius || 8) * (0.7 + p * 0.7);
            ctx.save();
            ctx.globalAlpha = 0.35 * a;
            ctx.fillStyle = rgba(e.rgb, 0.8);
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (e.kind === 'hit') {
            const a = 1 - p;
            const r = (e.radius || 10) * (0.7 + 1.2 * p);
            ctx.save();
            ctx.globalAlpha = 0.9 * a;
            ctx.strokeStyle = rgba(e.rgb, 0.95);
            ctx.lineWidth = 2;
            ctx.shadowBlur = 12 * a;
            ctx.shadowColor = rgba(e.rgb, 0.95);
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.25 * a;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(e.x, e.y, 2 + 4 * (1 - p), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (e.kind === 'explosion') {
            const a = 1 - p;
            const r = (e.radius || 28) * (0.6 + 1.1 * p);
            ctx.save();
            ctx.globalAlpha = 0.75 * a;
            const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
            g.addColorStop(0, 'rgba(255,240,210,0.95)');
            g.addColorStop(0.2, 'rgba(255,180,80,0.75)');
            g.addColorStop(0.55, rgba(e.rgb, 0.35 * a));
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (e.kind === 'shockwave') {
            // Кольцевая ударная волна: расширяется и истончается
            const a = 1 - p;
            const r = (e.r0 || 4) + ((e.r1 || 90) - (e.r0 || 4)) * p;
            const w = (e.width || 3) * (0.9 + (1 - p) * 0.6);
            ctx.save();
            ctx.globalAlpha = 0.55 * a;
            ctx.strokeStyle = rgba(e.rgb, 0.95);
            ctx.lineWidth = w;
            ctx.shadowBlur = 18 * a;
            ctx.shadowColor = rgba(e.rgb, 0.6);
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.stroke();
            // Внутреннее полупрозрачное кольцо
            ctx.globalAlpha = 0.18 * a;
            ctx.shadowBlur = 0;
            ctx.lineWidth = Math.max(1, w - 1);
            ctx.beginPath();
            ctx.arc(e.x, e.y, r * 0.92, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else if (e.kind === 'smoke') {
            // Дым: мягкий туман с ростом радиуса и дрейфом
            const a = (e.a0 || 0.22) * (1 - p);
            const r = (e.r0 || 8) + ((e.r1 || 36) - (e.r0 || 8)) * p;
            const x = e.x + (e.vx || 0) * (age / 1000);
            const y = e.y + (e.vy || 0) * (age / 1000);
            ctx.save();
            ctx.globalAlpha = a;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(220,230,240,0.55)');
            g.addColorStop(0.55, 'rgba(140,160,180,0.25)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (e.kind === 'target') {
            const a = 1 - p;
            const r = (e.radius || 20) * (0.95 + 0.05 * Math.sin(age / 60));
            const rot = age / 220;
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(rot);
            ctx.globalAlpha = 0.75 * a;
            ctx.strokeStyle = rgba(e.rgb, 0.95);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
            // крестик
            ctx.beginPath();
            ctx.moveTo(-r - 6, 0);
            ctx.lineTo(-r + 6, 0);
            ctx.moveTo(r - 6, 0);
            ctx.lineTo(r + 6, 0);
            ctx.moveTo(0, -r - 6);
            ctx.lineTo(0, -r + 6);
            ctx.moveTo(0, r - 6);
            ctx.lineTo(0, r + 6);
            ctx.stroke();
            // дуги
            ctx.globalAlpha = 0.35 * a;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0.25, 1.0);
            ctx.stroke();
            ctx.restore();
        } else if (e.kind === 'particle') {
            // частицы обновляем по dt
            const a = 1 - p;
            e.x += (e.vx || 0) * dtSec;
            e.y += (e.vy || 0) * dtSec;
            e.vx *= 0.88;
            e.vy *= 0.88;
            ctx.save();
            ctx.globalAlpha = 0.9 * a;
            ctx.fillStyle = rgba(e.rgb, 0.95);
            ctx.shadowBlur = 8 * a;
            ctx.shadowColor = rgba(e.rgb, 0.8);
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.size || 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        kept.push(e);
    }
    gameState.effects = kept;
}

function gameLoop(ctx, canvas) {
    // Реальное время кадра (для расчёта dt); симуляция идёт по defenseTime
    const nowReal = Date.now();
    const dtReal = Math.min(34, nowReal - (gameState._lastFrameTime || nowReal));
    gameState._lastFrameTime = nowReal;

    const timeScale = gameState.timeScale || 1;
    const dtSim = gameState.paused ? 0 : dtReal * timeScale;

    // Внутреннее время симуляции (останавливается на паузе, ускоряется на ×2)
    gameState.defenseTime = (gameState.defenseTime || 0) + dtSim;
    const now = gameState.defenseTime;

    const dtFactor = dtSim / 16.6667; // 1.0 ≈ 60 FPS

    // Фон
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Звёзды (анимируются по внутреннему времени)
    drawStars(ctx, canvas, now);

    // Сетка полигона
    ctx.strokeStyle = 'rgba(201, 176, 122, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 10]);

    for (let x = 0; x < canvas.width; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.setLineDash([]);

    // --- Спавн врагов через очередь (учитывает паузу/скорость) ---
    if (Array.isArray(gameState.spawnQueue) && gameState.spawnQueue.length) {
        // queue already ordered by time
        while (gameState.spawnQueue.length && gameState.spawnQueue[0].at <= now) {
            const s = gameState.spawnQueue.shift();
            gameState.enemies.push({
                x: s.x,
                y: s.y,
                speed: s.speed,
                baseSpeed: s.speed,
                health: s.health,
                maxHealth: s.health,
                kind: s.kind,
                name: s.name,
                icon: s.icon,
                color: s.color,
                reward: s.reward,
                leakDamage: s.leakDamage,
                dmgMul: s.dmgMul,
                size: s.size,
                slowUntil: 0,
                slowMul: 1,
                isBoss: s.isBoss
            });
        }
    }

    // --- Превью установки башни (ghost) ---
    if (gameState.selectedTower !== null && gameState.pointer && gameState.pointer.active) {
        const towerType = towerTypes[gameState.selectedTower];
        const x = gameState.pointer.x;
        const y = gameState.pointer.y;
        const ok = !!(gameState.placement && gameState.placement.ok);

        ctx.save();
        ctx.globalAlpha = ok ? 0.65 : 0.55;

        // дальность (пунктир)
        ctx.setLineDash([8, 10]);
        ctx.strokeStyle = ok ? 'rgba(201, 176, 122, 0.75)' : 'rgba(255, 90, 90, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, towerType.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // тело башни
        ctx.fillStyle = ok ? towerType.color : 'rgba(184, 107, 95, 0.9)';
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fill();

        // иконка
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(towerType.icon, x, y);

        // крестик, если место недоступно
        if (!ok) {
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = 'rgba(255, 120, 120, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x - 12, y - 12);
            ctx.lineTo(x + 12, y + 12);
            ctx.moveTo(x + 12, y - 12);
            ctx.lineTo(x - 12, y + 12);
            ctx.stroke();
        }

        ctx.restore();
    }

    // --- Башни ---
    gameState.towers.forEach((tower, idx) => {
        ensureTowerRuntimeFields(tower);
        const baseType = towerTypes[tower.type];

        // Обновляем вращение радара (привязано к dt)
        if (tower.type === 0) {
            tower.rotation += 0.02 * dtFactor;
        }

        // Круг дальности
        ctx.strokeStyle = baseType.color + '44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
        ctx.stroke();

        // Выделение выбранной башни
        if (gameState.selectedPlacedTower === idx) {
            ctx.strokeStyle = 'rgba(201, 176, 122, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(tower.x, tower.y, 26, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Для РЛС — «луч обзора»
        if (tower.type === 0) {
            const rgb = hexToRgb(baseType.color);
            ctx.save();
            ctx.translate(tower.x, tower.y);
            ctx.rotate(tower.rotation);
            const sweepLen = Math.min(220, tower.range);
            const grad = ctx.createLinearGradient(0, 0, sweepLen, 0);
            grad.addColorStop(0, rgba(rgb, 0));
            grad.addColorStop(0.15, rgba(rgb, 0.08));
            grad.addColorStop(1, rgba(rgb, 0.0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(sweepLen, -18);
            ctx.lineTo(sweepLen, 18);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // Пульс
        const pulseSize = Math.sin(now / 500) * 5 + 25;
        ctx.fillStyle = baseType.color + '77';
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // Рисуем башню
        ctx.fillStyle = baseType.color;

        if (tower.type === 0) {
            ctx.save();
            ctx.translate(tower.x, tower.y);
            ctx.rotate(tower.rotation);

            ctx.fillRect(-12, -12, 24, 24);

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.moveTo(0, -25);
            ctx.lineTo(-20, 0);
            ctx.lineTo(20, 0);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        } else if (tower.type === 1) {
            ctx.fillRect(tower.x - 15, tower.y - 15, 30, 30);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(tower.x - 5, tower.y - 25, 10, 40);
        } else {
            ctx.fillRect(tower.x - 20, tower.y - 10, 40, 20);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(tower.x - 5, tower.y - 25, 10, 30);
        }

        // Иконка
        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(baseType.icon, tower.x, tower.y);
    });

    // --- Враги: обновление и отрисовка ---
    let hudDirty = false;

    gameState.enemies = gameState.enemies.filter(enemy => {
        // движение (учитываем dt)
        // движение (учитывает dt + статус‑эффекты)
        if (enemy.baseSpeed == null) enemy.baseSpeed = enemy.speed;
        const spMul = getEnemySpeedMul(enemy, now);
        enemy.x += enemy.baseSpeed * spMul * dtFactor;

        if (enemy.x > canvas.width) {
            const leakDmg = (enemy && enemy.leakDamage != null) ? Number(enemy.leakDamage) : 15;
            gameState.health -= leakDmg;
            gameState.enemiesRemaining--;
            hudDirty = true;

            if (gameState.waveStats) gameState.waveStats.leaks++;
            if (gameState.runStats) gameState.runStats.leaks++;

            if (gameState.health <= 0) {
                triggerDefenseGameOver();
            }

            return false;
        }

        if (enemy.health <= 0) {
            const reward = (enemy && enemy.reward != null) ? Number(enemy.reward) : 75;
            gameState.resources += reward;
            gameState.enemiesRemaining--;
            hudDirty = true;

            if (gameState.waveStats) {
                gameState.waveStats.kills++;
                gameState.waveStats.reward = (gameState.waveStats.reward || 0) + reward;
            }
            if (gameState.runStats) {
                gameState.runStats.kills++;
                gameState.runStats.reward = (gameState.runStats.reward || 0) + reward;
            }

            // Приятная "смертельная" вспышка (особенно заметно на боссе)
            const rgb = hexToRgb(enemy.color || '#ffffff');
            pushEffect({ kind: 'explosion', x: enemy.x, y: enemy.y, rgb, t0: now, duration: 240, radius: enemy.isBoss ? 54 : 32 });
            pushEffect({ kind: 'shockwave', x: enemy.x, y: enemy.y, rgb, t0: now, duration: 560, r0: 6, r1: enemy.isBoss ? 120 : 84, width: enemy.isBoss ? 4 : 3 });
            for (let s = 0; s < (enemy.isBoss ? 6 : 3); s++) spawnSmokePuff(enemy.x, enemy.y, now, enemy.isBoss ? 1.3 : 1);

            return false;
        }

        // Рисуем врага
        ctx.save();
        ctx.translate(enemy.x, enemy.y);

        const r = enemy.size || 12;
        const color = enemy.color || '#B86B5F';
        ctx.fillStyle = color;

        // корпус
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(-0.66 * r, 0.66 * r);
        ctx.lineTo(0, 0.32 * r);
        ctx.lineTo(0.66 * r, 0.66 * r);
        ctx.closePath();
        ctx.fill();

        // обводка для брони/босса
        if (enemy.kind === 'armored' || enemy.isBoss) {
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth = enemy.isBoss ? 3 : 2;
            ctx.stroke();
        }

        // Индикатор статуса (Stage-14): замедление
        if (isEnemySlowed(enemy, now)) {
            ctx.strokeStyle = 'rgba(71, 215, 255, 0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Огонь из двигателя
        ctx.fillStyle = enemy.isBoss ? 'rgba(255,140,180,0.95)' : 'rgba(255,180,80,0.95)';
        ctx.beginPath();
        ctx.moveTo(-0.3 * r, 0.66 * r);
        ctx.lineTo(0, 1.35 * r);
        ctx.lineTo(0.3 * r, 0.66 * r);
        ctx.closePath();
        ctx.fill();

        // Иконка типа
        if (enemy.icon) {
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.font = `800 ${Math.max(10, Math.round(r * 0.95))}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(enemy.icon, 0, 2);
        }

        ctx.restore();

        // Полоска здоровья
        const healthPercent = enemy.health / enemy.maxHealth;

        const barW = Math.max(40, Math.round((enemy.size || 12) * 3.2));
        const barX = enemy.x - barW / 2;
        const barY = enemy.y - (r + 14);

        ctx.fillStyle = 'rgba(20,20,24,0.85)';
        ctx.fillRect(barX, barY, barW, 7);
        ctx.fillStyle = healthPercent > 0.5 ? '#4CAF50' : healthPercent > 0.25 ? '#FFA500' : '#FF4444';
        ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(1, healthPercent)), 7);

        if (enemy.isBoss) {
            ctx.fillStyle = 'rgba(255,255,255,0.78)';
            ctx.font = '700 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('BOSS', enemy.x, barY - 12);
        }

        return true;
    });

    // HUD обновляем только если что-то изменилось
    if (hudDirty) updateDefenseHUD();
    else {
        // но счётчик оставшихся целей обновляем мягко (чтобы в UI было живо)
        const leftEl = document.getElementById('enemiesLeft');
        if (leftEl) leftEl.textContent = String(gameState.enemiesRemaining || 0);
    }

    // --- Стрельба башен ---
    const currentTime = now;
    gameState.towers.forEach(tower => {
        ensureTowerRuntimeFields(tower);
        const baseType = towerTypes[tower.type] || towerTypes[0];
        if (!baseType) return;

        const towerType = { ...baseType, damage: tower.damage, range: tower.range, firerate: tower.firerate };

        const fireDelay = 1000 / towerType.firerate;
        if (currentTime - tower.lastFire < fireDelay) return;

        const target = pickTargetForTower(tower, towerType);
        if (!target) return;

        if (tower.type === 2) {
            spawnMissile(tower, target, towerType, currentTime);
        } else {
            spawnLaserShot(tower, target, towerType, currentTime);
            const mul = (target && typeof target.dmgMul === 'number') ? target.dmgMul : 1;
            const dmg = Math.max(1, Math.round(towerType.damage * mul));
            target.health -= dmg;

            // Stage-14: статус‑эффекты при попадании (замедление)
            applyEffectsToEnemy(target, tower.onHitEffects, currentTime);
        }

        tower.lastFire = currentTime;
    });

    // Эффекты/снаряды
    updateAndRenderCombatFX(ctx, currentTime, dtSim);

    // --- Конец волны ---
    const waveDone = (gameState.enemiesRemaining === 0 && gameState.enemies.length === 0 && (!gameState.spawnQueue || gameState.spawnQueue.length === 0));
    if (waveDone) {
        if (!gameState.waveSummaryShown) {
            gameState.waveSummaryShown = true;

            const ws = gameState.waveStats || { kills: 0, leaks: 0, total: 0, startHealth: gameState.health };
            const lostHp = Math.max(0, (ws.startHealth || gameState.health) - gameState.health);
            const reward = Math.round(ws.reward || (ws.kills || 0) * 75);

            // Stage-13: фиксируем пройденную волну в статистике забега
            if (gameState.runStats) {
                gameState.runStats.wavesCompleted = Math.max(gameState.runStats.wavesCompleted || 0, gameState.wave);
            }

            showToast(`✅ Волна ${gameState.wave} завершена: уничтожено ${ws.kills}/${ws.total}, прорывов ${ws.leaks}, награда +${reward}, база −${lostHp} HP`, 'success');
        }

        const factWrap = document.getElementById('historicalFact');
        if (factWrap && factWrap.classList.contains('hidden')) {
            // Stage-13: компактный отчёт по волне (внутри панели «Факт»)
            const ws = gameState.waveStats || { kills: 0, leaks: 0, total: 0 };
            const lostHp = Math.max(0, (ws.startHealth || gameState.health) - gameState.health);
            const reward = Math.round(ws.reward || 0);
            const types = ws.types || {};
            const wsEl = document.getElementById('waveSummary');
            if (wsEl) {
                const parts = [];
                parts.push(`<strong>Волна ${gameState.wave} завершена</strong>`);
                parts.push(`Уничтожено: ${ws.kills}/${ws.total} • Прорывов: ${ws.leaks} • Награда: +${reward} • Потери: −${lostHp} HP`);

                // Легенда типов (если есть)
                const tLine = [];
                if (types.fast) tLine.push(`⚡ ${types.fast}`);
                if (types.armored) tLine.push(`🛡 ${types.armored}`);
                if (types.boss) tLine.push(`☄️ ${types.boss}`);
                if (tLine.length) parts.push(`Типы целей: ${tLine.join(' • ')}`);

                wsEl.innerHTML = parts.join('<br>');
            }

            const fact = HistoricalFactsDB.next();

            document.getElementById('factTitle').textContent = fact.title;
            const factContentEl = document.getElementById('factContent');
            if (factContentEl) factContentEl.textContent = fact.content;
            factWrap.classList.remove('hidden');

            // Mobile UX: переключаем нижнюю панель на вкладку «Факт»
            if (isDefenseSheetEnabled()) {
                setDefenseSheetTab('fact', { silent: true });
            } else {
                // Если вкладок нет (десктоп) — просто подсветим, если вдруг показываем табы
                markDefenseFactAvailable();
            }

            if (window.FactReadMore && typeof window.FactReadMore.refresh === 'function') {
                window.FactReadMore.refresh();
            }
        }
    }

    // --- Пауза: визуальный индикатор ---
    if (gameState.paused) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '800 42px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ПАУЗА', canvas.width / 2, canvas.height / 2);
        ctx.font = '700 16px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText('P — продолжить • X — скорость', canvas.width / 2, canvas.height / 2 + 42);
        ctx.restore();
    }

    // Если игра закончилась — больше не планируем кадры
    if (!gameState._isGameOver) {
        gameState.gameLoop = requestAnimationFrame(() => gameLoop(ctx, canvas));
    }
}


function drawStars(ctx, canvas, t) {
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 50; i++) {
        const x = (Math.sin(i * 123.45) * 0.5 + 0.5) * canvas.width;
        const y = (Math.cos(i * 67.89) * 0.5 + 0.5) * canvas.height;
        const size = Math.sin(t / 1000 + i) * 0.5 + 1.5;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}


// Sound Controls
function getTrackForMode(mode) {
    if (mode === 'quest') return 'quest';
    if (mode === 'defense') return 'defense';
    // Меню/галерея/неизвестный режим — используем музыку меню
    return 'menu';
}

function toggleSound() {
    SoundManager.enabled = !SoundManager.enabled;

    if (SoundManager.enabled) {
        SoundManager.play(getTrackForMode(gameState && gameState.mode));
    } else {
        SoundManager.stop();
    }

    SoundManager.saveSettings();
    updateSoundToggleText();
    updateSoundPanelIcon();
}


function changeVolume(value) {
    SoundManager.setVolume(value);
    // Не меняем текст кнопки на проценты, чтобы панель выглядела аккуратно.
    // При желании можно показывать проценты рядом с лейблом.
    const label = document.querySelector('.sound-controls .volume-control label');
    if (label) label.textContent = `Громкость: ${Math.round(value)}%`;
}

// Prevent context menu
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }
});

// (Стили блока исторического факта вынесены в styles.css)
// === END UI COMPACT OVERLAY FOR DEFENSE FACT ===
