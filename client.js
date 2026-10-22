window.__ModuleLoader__.load({
  id: 'dsh-image-zoom',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const {
      useCallback,
      useEffect,
      useMemo,
      useRef,
      useState,
      useSyncExternalStore,
    } = React;

    const NS = 'image-zoom';
    const MAX_SCALE = 8;
    const MIN_SCALE = 1;
    const SLOT_NAMES = [
      'conversation.chat.message.images',
      'conversation.chat.user.images',
      'conversation.trajectory.images',
      'tool.call.images',
    ];

    const DICTS = {
      zh: {
        preview: '图片预览',
        close: '关闭预览',
      },
      en: {
        preview: 'Image preview',
        close: 'Close preview',
      },
    };

    const CSS = [
      '.dshIz_gallery{display:flex;flex-wrap:wrap;gap:10px;max-width:100%}',
      '.dshIz_gallery[data-align=end]{justify-content:flex-end;align-self:flex-end}',
      '.dshIz_gallery[data-align=start]{justify-content:flex-start;align-self:flex-start}',
      '.dshIz_frame{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-interactive-bg-hover);cursor:zoom-in;flex:none;display:grid;place-items:center;min-width:44px;min-height:44px;padding:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dshIz_frame[data-variant=tile]{width:64px;min-width:64px;height:64px;min-height:64px}',
      '.dshIz_frame[data-variant=thumbnail]{box-sizing:border-box;border-radius:var(--dsw-radius-lg);width:48px;min-width:48px;height:48px;min-height:48px;padding:2px}',
      '.dshIz_frame img{object-fit:cover;width:100%;height:100%;display:block}',
      '.dshIz_frame[data-variant=thumbnail] img{object-fit:contain}',
      '.dshIz_frame:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dshIz_error{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;max-width:240px;padding:10px 12px;font-size:12px;line-height:18px}',
      '.dshIz_error[data-variant=tile]{border-radius:var(--dsw-radius-xl);width:64px;height:64px;padding:4px;overflow:hidden}',
      '.dshIz_error[data-variant=thumbnail]{box-sizing:border-box;border-radius:var(--dsw-radius-lg);width:48px;min-width:48px;height:48px;min-height:48px;padding:2px;place-items:center;display:grid}',
      '.dshIz_error:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dshIz_spinner{animation:dshIz_spin .9s linear infinite}',
      '@keyframes dshIz_spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.dshIz_spinner{animation:none}}',
      '.dshIz_backdrop{position:fixed;inset:0;z-index:2147483000;isolation:isolate;overflow:hidden;pointer-events:auto;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}',
      '.dshIz_stage{position:absolute;inset:var(--dsh-frame-chrome-top, 0px) 0 0}',
      '.dshIz_scroll{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:40px;scrollbar-width:none}',
      '.dshIz_scroll::-webkit-scrollbar{display:none}',
      '.dshIz_center{display:flex;align-items:center;justify-content:center;width:max-content;min-width:100%;height:max-content;min-height:100%}',
      '.dshIz_image{display:block;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-input-major);box-shadow:var(--dsw-elevation-prominent);user-select:none;-webkit-user-select:none;touch-action:none}',
      '.dshIz_close{position:absolute;top:20px;right:20px;z-index:3;display:grid;place-items:center;width:36px;height:36px;padding:0;border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.dshIz_close:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dshIz_close:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px}',
      '@media (max-width:640px){.dshIz_scroll{padding:16px}}',
    ].join('\n');

    const viewerListeners = new Set();
    let viewerState = null;

    function emitViewer() {
      for (const listener of [...viewerListeners]) {
        try {
          listener();
        } catch (error) {
          console.error('image-zoom viewer subscriber crashed:', error);
        }
      }
    }

    function openViewer(next) {
      viewerState = { src: next.src, alt: next.alt };
      emitViewer();
    }

    function closeViewer() {
      if (viewerState === null) return;
      viewerState = null;
      emitViewer();
    }

    function subscribeViewer(listener) {
      viewerListeners.add(listener);
      return () => {
        viewerListeners.delete(listener);
      };
    }

    function getViewer() {
      return viewerState;
    }

    function clampScale(value) {
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
    }

    function distance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function dimensionsOf(image) {
      if ('attachment' in image) return image.attachment;
      const preview = image.preview;
      return preview !== undefined && preview.width !== undefined && preview.height !== undefined
        ? { width: preview.width, height: preview.height }
        : undefined;
    }

    /** 240px long edge, aspect clamped to [0.25, 4], never upscaled. */
    function singleFit(dimensions) {
      const natural = dimensions.width / dimensions.height;
      const ratio = Math.min(4, Math.max(0.25, natural));
      const box = ratio >= 1
        ? { width: 240, height: 240 / ratio }
        : { width: 240 * ratio, height: 240 };
      const scale = Math.min(1, dimensions.width / box.width, dimensions.height / box.height);
      return {
        width: Math.max(1, Math.round(box.width * scale)),
        height: Math.max(1, Math.round(box.height * scale)),
        objectPosition: natural < 0.25 ? 'center top' : natural > 4 ? 'left center' : 'center',
      };
    }

    function imageKey(image, index) {
      const id = 'attachment' in image ? image.attachment.attachmentId : image.preview.url;
      return `${String(id)}:${String(index)}`;
    }

    function SpinnerIcon() {
      return h('svg', {
        className: 'dshIz_spinner',
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('circle', {
        cx: 8,
        cy: 8,
        r: 6,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeDasharray: '26 12',
        strokeLinecap: 'round',
      }));
    }

    function RetryIcon() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, [
        h('path', { key: 'arc', d: 'M13 8a5 5 0 1 1-1.5-3.5' }),
        h('path', { key: 'head', d: 'M12.5 2.5v3h-3' }),
      ]);
    }

    function CloseIcon() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', { d: 'M4 4l8 8M12 4l-8 8' }));
    }

    function GalleryImage({ image, load, variant, t }) {
      const preview = 'preview' in image ? image.preview : undefined;
      const attachment = 'attachment' in image ? image.attachment : undefined;
      const peek = useMemo(() => (typeof load === 'function' && typeof load.peek === 'function'
        ? load.peek.bind(load)
        : undefined), [load]);
      const [loaded, setLoaded] = useState(() => attachment === undefined
        ? null
        : (peek !== undefined ? peek(attachment) : null) ?? null);
      const [error, setError] = useState(false);
      const [attempt, setAttempt] = useState(0);

      useEffect(() => {
        if (attachment === undefined || typeof load !== 'function') return undefined;
        let live = true;
        setError(false);
        setLoaded((peek !== undefined ? peek(attachment) : null) ?? null);
        Promise.resolve(load(attachment)).then((url) => {
          if (live) setLoaded(url);
        }).catch(() => {
          if (live) setError(true);
        });
        return () => {
          live = false;
        };
      }, [attachment, load, peek, attempt]);

      const dimensions = useMemo(() => dimensionsOf(image), [image]);
      const fit = useMemo(() => {
        if (variant !== 'single') return undefined;
        if (dimensions === undefined) return { width: 240, height: 240, objectPosition: 'center' };
        return singleFit(dimensions);
      }, [dimensions, variant]);

      const src = preview !== undefined ? preview.url : loaded;
      const label = ('attachment' in image ? image.label : undefined)
        ?? (preview !== undefined ? preview.name : undefined)
        ?? (attachment !== undefined ? attachment.name : undefined)
        ?? t('image.label');
      const loadingThumbnail = variant === 'thumbnail' && src === null;

      if (error) {
        return h('button', {
          type: 'button',
          className: 'dshIz_error',
          'data-variant': variant,
          title: variant === 'thumbnail' ? t('image.loadFailed') : undefined,
          'aria-label': variant === 'thumbnail' ? t('image.loadFailed') : undefined,
          onClick: () => {
            setAttempt((value) => value + 1);
          },
        }, variant === 'thumbnail'
          ? h('span', { 'aria-hidden': 'true' }, h(RetryIcon))
          : t('image.loadFailed'));
      }

      return h('button', {
        type: 'button',
        className: 'dshIz_frame',
        'data-variant': variant,
        style: fit === undefined ? undefined : { width: fit.width, height: fit.height },
        title: loadingThumbnail ? t('image.loading') : t('image.openOriginal'),
        'aria-label': loadingThumbnail ? t('image.loading') : t('image.openOriginalLabel', { label }),
        'aria-busy': loadingThumbnail || undefined,
        onClick: () => {
          if (src !== null && src !== undefined) openViewer({ src, alt: label });
        },
      }, src === null || src === undefined
        ? h('span', { 'aria-hidden': loadingThumbnail || undefined }, loadingThumbnail ? h(SpinnerIcon) : t('image.loading'))
        : h('img', {
          src,
          alt: label,
          style: fit === undefined ? undefined : { objectPosition: fit.objectPosition },
        }));
    }

    function ImageZoomGallery({ images, loadImage, align, compact = false, thumbnail = false, t }) {
      if (!Array.isArray(images) || images.length === 0) return null;
      const variant = thumbnail ? 'thumbnail' : (compact || images.length > 1) ? 'tile' : 'single';
      return h('div', { className: 'dshIz_gallery', 'data-align': align },
        images.map((image, index) => h(GalleryImage, {
          key: imageKey(image, index),
          image,
          load: loadImage,
          variant,
          t,
        })));
    }

    function ZoomViewer({ src, alt, t }) {
      const [base, setBase] = useState(null);
      const baseRef = useRef(null);
      const scaleRef = useRef(1);
      const scrollRef = useRef(null);
      const imageRef = useRef(null);
      const closeRef = useRef(null);
      const focusReturnRef = useRef(null);
      const pointersRef = useRef(new Map());
      const pinchRef = useRef(null);

      const onImageLoad = useCallback(() => {
        if (baseRef.current !== null) return;
        const image = imageRef.current;
        const viewport = scrollRef.current;
        if (image === null || viewport === null) return;
        const computed = getComputedStyle(viewport);
        const availWidth = Math.max(
          1,
          viewport.clientWidth - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight),
        );
        const availHeight = Math.max(
          1,
          viewport.clientHeight - parseFloat(computed.paddingTop) - parseFloat(computed.paddingBottom),
        );
        const naturalWidth = image.naturalWidth > 0 ? image.naturalWidth : image.offsetWidth;
        const naturalHeight = image.naturalHeight > 0 ? image.naturalHeight : image.offsetHeight;
        const width = Math.max(1, naturalWidth || availWidth);
        const height = Math.max(1, naturalHeight || availHeight);
        const ratio = Math.min(1, availWidth / width, availHeight / height);
        baseRef.current = {
          width: Math.max(1, Math.round(width * ratio)),
          height: Math.max(1, Math.round(height * ratio)),
        };
        setBase(baseRef.current);
      }, []);

      useEffect(() => {
        const image = imageRef.current;
        if (image !== null && image.complete && image.naturalWidth > 0) onImageLoad();
      }, [onImageLoad]);

      /** Size the image in layout pixels: SVG re-renders at the new size, so it stays sharp. */
      const applySize = useCallback((nextScale) => {
        const image = imageRef.current;
        const baseSize = baseRef.current;
        if (image === null || baseSize === null) return;
        image.style.width = `${String(baseSize.width * nextScale)}px`;
        image.style.height = `${String(baseSize.height * nextScale)}px`;
      }, []);

      /** Resize around the pointer, then carry the anchor with the native scroll port. */
      const zoomTo = useCallback((nextScale, clientX, clientY) => {
        const image = imageRef.current;
        const viewport = scrollRef.current;
        if (image === null || viewport === null || baseRef.current === null) return;
        const clamped = clampScale(nextScale);
        const current = scaleRef.current;
        if (clamped === current) return;
        const before = image.getBoundingClientRect();
        const rx = (clientX - before.left) / current;
        const ry = (clientY - before.top) / current;
        scaleRef.current = clamped;
        applySize(clamped);
        const after = image.getBoundingClientRect();
        viewport.scrollLeft += after.left + rx * clamped - clientX;
        viewport.scrollTop += after.top + ry * clamped - clientY;
      }, [applySize]);

      const resetView = useCallback(() => {
        scaleRef.current = MIN_SCALE;
        applySize(MIN_SCALE);
        const viewport = scrollRef.current;
        if (viewport !== null) {
          viewport.scrollLeft = 0;
          viewport.scrollTop = 0;
        }
      }, [applySize]);

      useEffect(() => {
        const node = scrollRef.current;
        if (node === null) return undefined;
        const onWheel = (event) => {
          if (!event.ctrlKey) return; // plain two-finger scroll pans the native scroll port
          event.preventDefault();
          /* macOS trackpad pinch arrives as a ctrl+wheel stream. */
          const factor = Math.min(1.25, Math.max(0.8, Math.exp(-event.deltaY * 0.008)));
          zoomTo(scaleRef.current * factor, event.clientX, event.clientY);
        };
        node.addEventListener('wheel', onWheel, { passive: false });
        return () => {
          node.removeEventListener('wheel', onWheel);
        };
      }, [zoomTo]);

      useEffect(() => {
        focusReturnRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        if (closeRef.current !== null) closeRef.current.focus();
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (scaleRef.current > MIN_SCALE) {
              resetView();
            } else {
              closeViewer();
            }
            return;
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            if (closeRef.current !== null) closeRef.current.focus();
          }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => {
          window.removeEventListener('keydown', onKeyDown, true);
          const target = focusReturnRef.current;
          if (target !== null && target.isConnected) target.focus();
        };
      }, [resetView]);

      const onPointerDown = (event) => {
        if (event.pointerType === 'mouse') return;
        if (typeof event.currentTarget.setPointerCapture === 'function') {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
          }
        }
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointersRef.current.size === 2) {
          const points = Array.from(pointersRef.current.values());
          pinchRef.current = {
            distance: distance(points[0], points[1]),
            scale: scaleRef.current,
          };
        }
      };

      const onPointerMove = (event) => {
        const pointers = pointersRef.current;
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size < 2 || pinchRef.current === null) return;
        const points = Array.from(pointers.values()).slice(0, 2);
        const pinch = pinchRef.current;
        const midX = (points[0].x + points[1].x) / 2;
        const midY = (points[0].y + points[1].y) / 2;
        zoomTo(
          pinch.scale * (distance(points[0], points[1]) / Math.max(1, pinch.distance)),
          midX,
          midY,
        );
      };

      const endPointer = (event) => {
        pointersRef.current.delete(event.pointerId);
        if (pointersRef.current.size < 2) pinchRef.current = null;
      };

      const onScrollClick = (event) => {
        if (event.target === imageRef.current) return;
        closeViewer();
      };

      const imageStyle = base === null
        ? { visibility: 'hidden' }
        : {
          width: `${String(base.width * scaleRef.current)}px`,
          height: `${String(base.height * scaleRef.current)}px`,
        };

      return h('div', {
        className: 'dshIz_backdrop',
        'data-dsh-image-zoom': '',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('preview'),
      }, h('div', { className: 'dshIz_stage' }, [
        h('div', {
          key: 'scroll',
          ref: scrollRef,
          className: 'dshIz_scroll',
          onClick: onScrollClick,
        }, h('div', { className: 'dshIz_center' }, h('img', {
          ref: imageRef,
          className: 'dshIz_image',
          src,
          alt,
          draggable: false,
          style: imageStyle,
          onLoad: onImageLoad,
          onPointerDown,
          onPointerMove,
          onPointerUp: endPointer,
          onPointerCancel: endPointer,
        }))),
        h('button', {
          key: 'close',
          ref: closeRef,
          type: 'button',
          className: 'dshIz_close',
          'aria-label': t('close'),
          title: t('close'),
          onClick: closeViewer,
        }, h(CloseIcon)),
      ]));
    }

    function useOwnTranslate(ctx) {
      const subscribe = useCallback((listener) => ctx.locale.subscribe(listener), [ctx]);
      const getRevision = useCallback(() => ctx.locale.getSnapshot().revision, [ctx]);
      useSyncExternalStore(subscribe, getRevision, () => 0);
      return ctx.locale.bind(NS);
    }

    function ZoomOverlay({ ctx }) {
      const current = useSyncExternalStore(subscribeViewer, getViewer, getViewer);
      const t = useOwnTranslate(ctx);
      if (current === null) return null;
      return h(ZoomViewer, { key: current.src, src: current.src, alt: current.alt, t });
    }

    // Markdown images bypass the image slots and open their own lightbox, so
    // intercept their clicks before React does.
    const PREVIEWABLE_SLOTS = [
      'conversation.view',
      'conversation.chat.flow',
      'conversation.chat.node',
      'conversation.chat.message.images',
      'conversation.chat.user.images',
      'conversation.trajectory.images',
      'tool.call.images',
      'conversation.input.attachments',
    ];
    const PREVIEWABLE_SELECTOR = PREVIEWABLE_SLOTS
      .map((name) => `[data-slot="${name}"]`)
      .join(',');

    function installImageClickInterception() {
      const onClick = (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        let image = target.closest('img');
        if (image === null) {
          const button = target.closest('button');
          const nested = button instanceof HTMLElement ? button.querySelector('img') : null;
          image = nested;
        }
        if (!(image instanceof HTMLImageElement)) return;
        if (image.closest('[data-dsh-image-zoom]') !== null) return;
        if (image.closest('a') !== null) return;
        if (image.closest(PREVIEWABLE_SELECTOR) === null) return;
        const rect = image.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 24) return;
        if (image.naturalWidth > 0 && image.naturalWidth < 48) return;
        const src = image.currentSrc || image.src;
        if (typeof src !== 'string' || src === '') return;
        event.preventDefault();
        event.stopPropagation();
        openViewer({ src, alt: image.alt || '' });
      };
      window.addEventListener('click', onClick, true);
      return () => {
        window.removeEventListener('click', onClick, true);
      };
    }

    function apply(ctx) {
      ctx.effect(() => () => {
        closeViewer();
      }, 'image-zoom: viewer teardown');

      ctx.effect(() => ctx.locale.register(NS, DICTS), 'image-zoom: dictionaries');

      ctx.effect(installImageClickInterception, 'image-zoom: preview clicks');

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.imageZoom = '';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'image-zoom: stylesheet');

      for (const name of SLOT_NAMES) {
        ctx.slots.inject(name, () => ctx.slots.register({
          name,
          priority: 50,
          locale: 'conversation',
        }, ImageZoomGallery));
      }

      const Overlay = () => h(ZoomOverlay, { ctx });
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'image-zoom',
        order: 100,
      }, Overlay));
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
