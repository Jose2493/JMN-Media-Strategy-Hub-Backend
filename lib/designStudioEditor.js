// Private editor payload. Returned only after server-side template authorization.
export const DESIGN_TEMPLATE_SLUG='semper-athlete-shirt-01';
export const editorCss="\n  * { box-sizing: border-box; margin: 0; padding: 0; }\n  body {\n    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n    background: #0b0b0f;\n    color: #e8e8ec;\n    height: 100vh;\n    display: flex;\n    flex-direction: column;\n  }\n  #topbar {\n    padding: 10px 16px;\n    font-size: 13px;\n    color: #8a8a95;\n    border-bottom: 1px solid #1e1e26;\n  }\n  #main {\n    flex: 1;\n    display: flex;\n    overflow: hidden;\n  }\n  /* #main fija su propio display:flex (arriba), lo que le gana en\n     especificidad al display:none del [hidden] del navegador (selector de\n     ID contra selector de atributo) -- sin esta regla, el atributo hidden\n     no ocultaría nada acá y el gate de autenticación no serviría de nada. */\n  #main[hidden] { display: none; }\n  #canvas-wrap {\n    flex: 1;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    background: #f2f2f2; /* fondo neutro de mockup, el shirt PNG tiene transparencia */\n    overflow: hidden; /* fitCanvasToPreview() mantiene el canvas siempre dentro del panel -- nunca debería hacer falta scroll */\n  }\n  /* El tamaño real en pantalla del canvas lo fija fitCanvasToPreview() vía\n     canvas.setDimensions({...}, {cssOnly:true}) -- eso escribe estilos\n     inline sobre el wrapper/canvases que genera Fabric, que siempre ganan\n     sobre cualquier regla de este stylesheet. No hay reglas de tamaño acá\n     a propósito, para no confundir sobre cuál es la fuente de verdad. */\n  #panel {\n    width: 280px;\n    padding: 20px;\n    border-left: 1px solid #1e1e26;\n    display: flex;\n    flex-direction: column;\n    gap: 16px;\n  }\n  #panel h1 {\n    font-size: 15px;\n    font-weight: 600;\n    color: #e8e8ec;\n  }\n  .field { display: flex; flex-direction: column; gap: 6px; }\n  .field label { font-size: 12px; color: #8a8a95; }\n  .field input, .field select {\n    background: #17171d;\n    border: 1px solid #232330;\n    border-radius: 8px;\n    color: #e8e8ec;\n    padding: 10px 12px;\n    font-size: 14px;\n    font-family: inherit;\n  }\n  .field input:focus, .field select:focus { outline: none; border-color: #6d5bd0; }\n  .download-btn {\n    margin-top: 8px;\n    background: #6d5bd0;\n    color: white;\n    border: none;\n    border-radius: 8px;\n    padding: 12px;\n    font-size: 14px;\n    font-weight: 600;\n    cursor: not-allowed;\n    opacity: 0.5;\n  }\n  .download-btn.enabled {\n    cursor: pointer;\n    opacity: 1;\n  }\n  .download-btn.enabled:hover {\n    background: #5c4bc0;\n  }\n  #status { font-size: 12px; color: #8a8a95; }\n  #access-gate {\n    flex: 1;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    text-align: center;\n    padding: 40px;\n    font-size: 15px;\n    color: #8a8a95;\n  }\n  #access-gate[hidden] { display: none; }\n\n  /* ---------------------------------------------------------------------\n     Responsive móvil (<=768px) -- SOLO layout externo, nada de motor/canvas.\n     Causa raíz encontrada al inspeccionar la hoja de estilos actual: #main\n     usa display:flex sin flex-direction (default \"row\") y NO existía\n     ningún media query en todo el archivo, así que las dos columnas\n     persistían a cualquier ancho; #panel tiene un width:280px fijo que, en\n     un viewport de teléfono (~375-414px), le deja a #canvas-wrap (flex:1)\n     apenas ~90-100px -- exactamente la \"tira angosta\" reportada.\n\n     Fix: en este breakpoint, #main pasa a columna (preview arriba a ancho\n     completo, controles abajo a ancho completo) y #panel pierde su ancho\n     fijo. fitCanvasToPreview() no se toca -- ya lee wrap.clientWidth/\n     clientHeight dinámicamente y el ResizeObserver existente (agregado en\n     el pase de Fit to View) ya reacciona solo a este cambio de layout;\n     verificado en vivo contra el sitio en Vercel ya desplegado: el propio\n     ResizeObserver de la página, sin tocar una línea de JS, redimensionó el\n     canvas correctamente al aplicar este mismo CSS (328px = (376px de\n     ancho - 24px*2 de padding), el resultado esperado). No hace falta\n     ningún cambio de JS para este pase.\n\n     aspect-ratio:1/1 en #canvas-wrap replica el 1254x1254 nativo del\n     template -- así el preview ocupa el ancho completo del viewport y\n     fitCanvasToPreview() calcula un solo scale consistente (ancho y alto\n     coinciden), sin necesidad de adivinar una altura fija en px. */\n  @media (max-width: 768px) {\n    body { height: auto; min-height: 100vh; }\n    #main { flex-direction: column; overflow: visible; }\n    #canvas-wrap {\n      flex: none;\n      width: 100%;\n      aspect-ratio: 1 / 1;\n      overflow: hidden; /* fitCanvasToPreview() siempre lo deja adentro; nunca debería recortar contenido real */\n    }\n    #panel {\n      width: 100%;\n      border-left: none;\n      border-top: 1px solid #1e1e26;\n    }\n    /* Objetivos táctiles cómodos + evitar el auto-zoom de iOS Safari en\n       inputs con font-size menor a 16px (comportamiento estándar del\n       navegador, no un bug de esta página). */\n    .field input, .field select, .download-btn {\n      min-height: 48px;\n      font-size: 16px;\n    }\n  }\n";
export const editorMarkup="<div id=\"main\">\n  <div id=\"canvas-wrap\">\n    <canvas id=\"design-canvas-el\"></canvas>\n  </div>\n\n  <div id=\"panel\">\n    <h1 id=\"template-name\"></h1>\n\n    <div class=\"field\">\n      <label for=\"athlete-name-input\">Athlete Name</label>\n      <input id=\"athlete-name-input\" type=\"text\" value=\"TORRES\" maxlength=\"24\">\n    </div>\n\n    <div class=\"field\">\n      <label for=\"country-select\">Country / Flag</label>\n      <select id=\"country-select\">\n        <option value=\"\">Cargando países...</option>\n      </select>\n    </div>\n\n    <button id=\"download-btn\" class=\"download-btn\" disabled>Download Mockup</button>\n    <button id=\"artwork-download-btn\" class=\"download-btn\" disabled>Download Artwork</button>\n    <div style=\"font-size:12px;color:#8a8a95\">Print artwork: transparent PNG, 12 inches wide at 300 DPI (3600 px).</div>\n    <div id=\"status\">Cargando template...</div>\n  </div>\n</div>\n";
export function mountDesignStudio({assets,sessionToken,expiresAt,onUnavailable,slug,name}) {

  // ---------------------------------------------------------------------
  // TEMPLATE CONFIG — semper-athlete-shirt-01
  // Referencia conceptual, no viene de Supabase todavía (eso es fase 2).
  //
  // CALIBRACIÓN: estas coordenadas NO son a ojo. Se midieron programáticamente
  // sobre la foto de referencia real (TORRES + bandera RD) detectando los
  // bounding boxes de cada elemento impreso (umbral de brillo + componentes
  // conectados), expresándolos como % del bounding box de la camiseta en esa
  // foto, y aplicando ese mismo % al bounding box real de nuestro
  // shirt-mockup.png (medido vía canal alfa). Las dos fotos de camiseta no son
  // pixel-idénticas entre sí, así que esto es una calibración proporcional
  // fiel, no una copia exacta de coordenadas — deben confirmarse visualmente
  // una vez desplegado, pero parten de medición real, no de un placeholder.
  // ---------------------------------------------------------------------
  const TEMPLATE = {
    id: 'semper-athlete-shirt-01',
    canvas: { width: 1254, height: 1254 }, // dimensiones reales del PNG base
    shirtMockup: {
      src: null
    },
    fields: {
      athleteName: {
        // Centro del bloque de texto (no top-left) — mismo eje vertical de
        // referencia sin importar cuánto se achique la fuente para nombres largos.
        centerX: 641,
        centerY: 455,
        maxWidth: 547,    // igual al ancho que ocupa TORRES en la referencia — techo duro
        // maxHeight: medido igual que maxWidth (componentes conectados sobre la foto
        // master, mapeado al bbox real de shirt-mockup.png) -- altura real de la tinta
        // de TORRES, de 409 a 502 en esa escala = 93px.
        maxHeight: 93,
        fontFamily: '"Quantico", "Arial Narrow", sans-serif',
        fontWeight: 700,  // Quantico no tiene variante 900/Black -- 700 (Bold) es la más pesada que ofrece
        fontStyle: 'italic',
        // baseScaleX: estiramiento horizontal FIJO, calibrado UNA sola vez contra la
        // palabra TORRES (misma referencia que maxWidth/maxHeight), y aplicado POR IGUAL
        // a cualquier nombre -- nunca se recalcula por-nombre. Decisión explícita del
        // 2026-09-08: ningún candidato condensado (Saira, Roboto Condensed, Barlow
        // Condensed, Barlow Semi Condensed) alcanzaba el ancho real de TORRES (547px)
        // respetando maxHeight sin deformarse; Quantico + este scaleX fijo fue el
        // tratamiento aprobado tras comparación visual (~1.541, recalibrado en runtime
        // por calibrateAthleteNameReferenceSize -- ver esa función). Aplicar un scaleX
        // DISTINTO por nombre para forzar a cada uno al ancho de TORRES fue EXPLÍCITAMENTE
        // rechazado -- deformaría cada nombre de forma distinta y perdería consistencia
        // visual entre atletas. Este es el ÚNICO lugar del template donde se permite
        // escalar un eje por separado (scaleX != scaleY) -- nunca en flags, marks, o
        // artwork fijo.
        fill: '#EBEBEB',  // tono real medido en la impresión de la referencia (no blanco puro)
        originX: 'center',
        originY: 'center'
      },
      countryFlag: {
        countryCode: 'DO',  // ISO 3166-1 alpha-2.
        // "slot" es el parche horizontal fijo donde vive la bandera — NO es el
        // tamaño de la bandera en sí. La bandera se escala para CABER dentro
        // de este rectángulo preservando su aspect ratio, y se centra. El
        // slot es siempre el mismo tamaño/posición sin importar el país.
        slot: { x: 373, y: 289, width: 130, height: 80 }
      }
    }
  };

  // ---------------------------------------------------------------------
  // designGroup — elementos FIJOS de marca, bloqueados para el cliente.
  // Mismo método de calibración que arriba (medición real sobre la foto de
  // referencia): el bloque "línea + SEMPER CROSSFIT + USA" se midió como UNA
  // sola banda (left=330,top=506,right=888,bottom=568 en la foto master),
  // porque ahora se usa como UN solo artwork fijo (PNG oficial de JMN), no
  // como texto/formas reconstruidas — así que se coloca igual que el mark:
  // fit-dentro-del-slot preservando aspect ratio, sin texto aproximado.
  // ---------------------------------------------------------------------
  const DESIGN_GROUP_SPEC = {
    semperMark: {
      src: null,
      slot: { x: 797, y: 302, width: 77, height: 67 } // mismo patrón fit+center que la bandera
    },
    semperCrossfitArtwork: {
      // Asset oficial de JMN (línea + "SEMPER CROSSFIT" + caja "USA" ya
      // maquetados juntos) — recortado a su bounding box real de contenido
      // (558x62, aspect 9.0), casi idéntico al 8.87 medido en la foto master
      // para esa misma zona. Reemplaza la reconstrucción con texto/Rect.
      src: null,
      slot: { x: 368, y: 514, width: 532, height: 60 }
    }
  };

  // ---------------------------------------------------------------------
  // GARMENT BRANDING — etiqueta de cuello (S mark + "SEMPER" + talla "L").
  // Es branding de la PRENDA física, no del diseño del cliente -- por eso es
  // su propia capa, separada de designGroup, aunque se bloquea igual.
  // Asset oficial de JMN (neck-label.png), usado tal cual, no reconstruido.
  // Slot medido igual que el resto: componentes conectados sobre la foto
  // master (zona del cuello, x%:0.472-0.524, y%:0.055-0.103 del bbox de la
  // camiseta) mapeados al bbox real de shirt-mockup.png.
  // ---------------------------------------------------------------------
  const NECK_LABEL_SPEC = {
    src: null,
    slot: { x: 596, y: 115, width: 58, height: 58 }
  };

  // ---------------------------------------------------------------------
  // SISTEMA DE BANDERAS — basado en códigos ISO 3166-1 alpha-2.
  // Los SVG NO se generan aquí ni se traen de una URL remota: deben existir
  // localmente en public/assets/design-studio/flags/<CODE>.svg, extraídos
  // del paquete npm "country-flag-icons" (MIT) — ver instrucciones del repo.
  // manifest.json es la fuente de verdad de qué códigos hay disponibles;
  // se genera a partir de los archivos reales, nunca se hardcodea a mano.
  // ---------------------------------------------------------------------
  const FLAGS_BASE_PATH = 'assets/design-studio/flags/';
  const FLAGS_MANIFEST_PATH = FLAGS_BASE_PATH + 'manifest.json';

  function flagPath(code) {
    return FLAGS_BASE_PATH + code + '.svg';
  }

  // Nombre legible del país a partir del código ISO, sin lista propia que mantener.
  const countryNameFormatter = (typeof Intl !== 'undefined' && Intl.DisplayNames)
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

  function countryDisplayName(code) {
    if (!countryNameFormatter) return code;
    try {
      return countryNameFormatter.of(code) || code;
    } catch (e) {
      return code; // código no reconocido por Intl (p.ej. alguno de los "extra" del set, como XK/AC/TA/IC/EU)
    }
  }

  async function loadCountryManifest() {
    const res = await fetch(FLAGS_MANIFEST_PATH);
    if (!res.ok) throw new Error('manifest.json no encontrado (status ' + res.status + ')');
    const codes = await res.json();
    if (!Array.isArray(codes) || !codes.length) throw new Error('manifest.json vacío o con formato inesperado');
    return codes;
  }

  function populateCountrySelect(codes) {
    const options = codes
      .map(code => ({ code, name: countryDisplayName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    countrySelect.innerHTML = '';
    for (const { code, name } of options) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name + ' (' + code + ')';
      countrySelect.appendChild(opt);
    }

    const defaultCode = TEMPLATE.fields.countryFlag.countryCode;
    if (codes.includes(defaultCode)) {
      countrySelect.value = defaultCode;
    }
  }

  const statusEl = document.getElementById('status');

  // El status vacío igual reservaba espacio: #panel es un flex column con
  // gap:16px, así que aunque el <div> quedara sin texto (altura 0) el hueco
  // del gap ANTES de él seguía ahí. setStatus() lo saca por completo del
  // layout con el atributo hidden cuando no hay texto, y lo vuelve a mostrar
  // solo para un estado de carga o un error real.
  function setStatus(text) {
    statusEl.textContent = text || '';
    statusEl.hidden = !text;
  }
  const nameInput = document.getElementById('athlete-name-input');
  const countrySelect = document.getElementById('country-select');
  const downloadBtn = document.getElementById('download-btn');
  const artworkDownloadBtn = document.getElementById('artwork-download-btn');

  let canvas;
  let shirtMockup, neckLabelObj, semperMarkObj, semperCrossfitUsaObj, athleteNameObj, countryFlagObj;

  async function loadImageAsPromise(src) {
    if (Date.now() >= expiresAt) { onUnavailable(); throw Error('Unavailable'); }
    const response = await fetch(src, {headers:{Authorization:'Bearer '+sessionToken},cache:'no-store'});
    if (!response.ok) { onUnavailable(); throw Error('Unavailable'); }
    const objectUrl=URL.createObjectURL(await response.blob());
    try { return await new Promise((resolve,reject)=>fabric.Image.fromURL(objectUrl,img=>img ? resolve(img) : reject(Error('Unavailable')))); }
    finally { URL.revokeObjectURL(objectUrl); }
  }

  function fitObjectInSlot(obj, slot, w, h) {
    const scale = Math.min(slot.width / w, slot.height / h);
    obj.set({
      left: slot.x + slot.width / 2,
      top: slot.y + slot.height / 2,
      originX: 'center', originY: 'center',
      scaleX: scale, scaleY: scale
    });
    return obj;
  }

  // BUG ENCONTRADO Y CORREGIDO (build anterior):
  // Este código envolvía markImg/scImg en un fabric.Group con `left: 0, top: 0`
  // explícito en las opciones. fitObjectInSlot ya les había asignado left/top
  // ABSOLUTOS de canvas (p.ej. mark en left:835.5,top:335.5). El constructor de
  // fabric.Group calcula la posición/tamaño del grupo a partir del bounding box
  // real de sus hijos y convierte las coordenadas de estos a relativas-al-centro-
  // del-grupo usando ESE bounding box calculado -- pero como se pasó `left:0,
  // top:0` explícito, el grupo terminaba dibujándose en el origen del canvas en
  // vez de en su bounding box real, mientras los hijos ya habían sido
  // convertidos a offsets relativos a un centro distinto. Resultado: mark y
  // scImg se renderizaban desplazados cientos de píxeles de su slot real
  // (el mark cerca de (467,33) en vez de (835,335); el artwork SEMPER
  // CROSSFIT+USA cerca de (266,242) en vez de (634,544)) -- exactamente el
  // "todo desplazado hacia arriba/izquierda y cortado" que se reportó.
  //
  // FIX: se elimina el fabric.Group. Cada elemento fijo (mark, artwork
  // SEMPER CROSSFIT+USA, y ahora la etiqueta de cuello) se agrega directo al
  // canvas con SUS PROPIAS coordenadas absolutas (mismo sistema que ya usan
  // countryFlag y athleteName) y se bloquea individualmente -- así no hay dos
  // sistemas de coordenadas mezclados, todo el canvas usa coordenadas
  // absolutas. "designGroup"/"garmentBranding" siguen existiendo como
  // conceptos lógicos (qué está bloqueado y por qué), no como agrupación de
  // Fabric.
  async function loadFixedArtwork(spec) {
    const img = await loadImageAsPromise(spec.src);
    fitObjectInSlot(img, spec.slot, img.width, img.height);
    return img;
  }

  // Replace only the isolated horizontal rule in the authorized raster asset.
  // Detect its rows rather than assuming an asset-specific crop coordinate.
  async function loadStraightArtwork(spec) {
    const img = await loadImageAsPromise(spec.src);
    const surface = document.createElement('canvas');
    surface.width = img.width; surface.height = img.height;
    const ctx = surface.getContext('2d');
    ctx.drawImage(img.getElement(), 0, 0);
    // New owner-supplied flat PNG: trim its transparent margins without altering artwork.
    // Legacy strip remains supported until the private Storage asset is replaced.
    const bounds = inkBounds(surface);
    if (bounds.width / bounds.height > 11) {
      const scale = spec.slot.width / bounds.width;
      img.set({ cropX: bounds.left, cropY: bounds.top,
        width: bounds.width, height: bounds.height,
        left: spec.slot.x, top: spec.slot.y + spec.slot.height - bounds.height * scale,
        originX: 'left', originY: 'top', scaleX: scale, scaleY: scale });
      const rule = new fabric.Rect({ left: spec.slot.x, top: spec.slot.y,
        width: spec.slot.width, height: 2, fill: TEMPLATE.fields.athleteName.fill,
        strokeWidth: 0 });
      return new fabric.Group([img, rule], { objectCaching: false });
    }
    const pixels = ctx.getImageData(0, 0, surface.width, surface.height).data;
    let first = -1, last = -1;
    for (let y = 0; y < Math.floor(surface.height * 0.35); y++) {
      let count = 0;
      for (let x = 0; x < surface.width; x++) {
        if (pixels[(y * surface.width + x) * 4 + 3] > 64) count++;
      }
      if (count > surface.width * 0.6) {
        if (first < 0) first = y;
        last = y;
      }
    }
    if (first < 0) throw new Error('Could not isolate artwork rule');
    // Find the transparent separator beneath the complete curved rule.
    let cut = last + 1;
    for (; cut < surface.height * 0.45; cut++) {
      let occupied = false;
      for (let x = 0; x < surface.width; x++) {
        if (pixels[(cut * surface.width + x) * 4 + 3] > 32) { occupied = true; break; }
      }
      if (!occupied) break;
    }
    if (cut >= surface.height * 0.45) throw new Error('Artwork rule is not isolated');
    const scale = Math.min(spec.slot.width / img.width, spec.slot.height / img.height);
    const left = spec.slot.x + (spec.slot.width - img.width * scale) / 2;
    const top = spec.slot.y + (spec.slot.height - img.height * scale) / 2;
    img.set({ cropY: cut, height: img.height - cut, left, top: top + cut * scale,
      originX: 'left', originY: 'top', scaleX: scale, scaleY: scale });
    // Vector rectangle remains straight at any export resolution.
    const rule = new fabric.Rect({ left, top: top + first * scale,
      width: surface.width * scale, height: 2 * scale,
      fill: TEMPLATE.fields.athleteName.fill, strokeWidth: 0 });
    return new fabric.Group([img, rule], { objectCaching: false });
  }

  function lockObject(obj) {
    obj.set({
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      hoverCursor: 'default'
    });
    return obj;
  }

  // ---------------------------------------------------------------------
  // Auto-ajuste del nombre del atleta -- Quantico Bold Italic + scaleX fijo.
  //
  // Decisión aprobada (2026-09-08): ningún candidato condensado alcanzaba el
  // ancho real de TORRES (547px) respetando el techo de alto medido (93px)
  // sin deformarse -- Quantico se aprobó junto con un estiramiento horizontal
  // (scaleX) calibrado UNA vez contra TORRES y aplicado POR IGUAL a todos los
  // nombres. Esto es DISTINTO del enfoque anterior (dos fontSize de
  // referencia, ancho y alto, tomando el más chico): ahora hay UN solo
  // fontSize de referencia (calibrado por ALTURA) y UN scaleX fijo (calibrado
  // por ANCHO a partir de ese mismo fontSize) -- ninguno de los dos se
  // recalcula por nombre.
  //
  // Reglas explícitas de la aprobación:
  // - Mismo estilo Quantico Bold Italic y el MISMO scaleX base para cualquier
  //   nombre -- nunca un scaleX distinto por nombre para forzarlo al ancho de
  //   TORRES (eso deformaría cada nombre de forma distinta).
  // - Nombres más cortos/estrechos que TORRES: NUNCA se agrandan ni se
  //   estiran más para "rellenar" el ancho -- se quedan al fontSize de
  //   referencia, con el mismo scaleX fijo, y por lo tanto más angostos que
  //   TORRES. Eso es intencional.
  // - Nombres que exceden el ancho máximo (incluso después del scaleX fijo)
  //   O el alto máximo (por ejemplo, letras con tilde/diéresis como Ñ, Á, Ü
  //   -- comunes en apellidos dominicanos/latinoamericanos, y más altas que
  //   las mayúsculas simples) -- se resuelven achicando el fontSize completo
  //   de forma proporcional (nunca con un scaleX/scaleY independiente) hasta
  //   caber en AMBOS techos.
  // ---------------------------------------------------------------------
  let athleteNameReferenceFontSize = null; // calibrado SOLO por altura (maxHeight)
  let athleteNameBaseScaleX = null;        // estiramiento horizontal FIJO, igual para todos los nombres

  function measureAthleteTextWidth(text, fontSize) {
    const f = TEMPLATE.fields.athleteName;
    // Debe usar EXACTAMENTE los mismos fontWeight/fontStyle que el texto real --
    // itálica bold tiene un ancho de trazo/inclinación distinto al peso normal,
    // así que medir con otra variante daría una calibración de ancho incorrecta.
    const probe = new fabric.Text(text, { fontFamily: f.fontFamily, fontSize, fontWeight: f.fontWeight, fontStyle: f.fontStyle });
    probe.setCoords();
    return probe.getBoundingRect(true).width; // ancho NATURAL, sin scaleX -- el scaleX se aplica aparte
  }

  function measureAthleteTextHeight(text, fontSize) {
    const f = TEMPLATE.fields.athleteName;
    const probe = new fabric.Text(text, { fontFamily: f.fontFamily, fontSize, fontWeight: f.fontWeight, fontStyle: f.fontStyle });
    probe.setCoords();
    return probe.getBoundingRect(true).height; // el scaleX es horizontal solamente -- nunca afecta esta medición
  }

  function calibrateAthleteNameReferenceSize() {
    const TRIAL_SIZE = 300;
    const f = TEMPLATE.fields.athleteName;

    // 1) fontSize de referencia: el alto NATURAL (sin escalar) de TORRES debe
    //    llegar exactamente a maxHeight -- este es el único techo que fija el fontSize.
    const trialHeight = measureAthleteTextHeight('TORRES', TRIAL_SIZE);
    athleteNameReferenceFontSize = TRIAL_SIZE * (f.maxHeight / trialHeight);

    // 2) scaleX base: a ESE fontSize, cuánto hay que estirar horizontalmente
    //    el ancho natural de TORRES para llegar exactamente a maxWidth. Se
    //    calibra UNA sola vez aquí y después se usa fijo para cualquier nombre.
    const naturalWidthAtReference = measureAthleteTextWidth('TORRES', athleteNameReferenceFontSize);
    athleteNameBaseScaleX = f.maxWidth / naturalWidthAtReference;
  }

  function fitAthleteNameFontSize(text) {
    const f = TEMPLATE.fields.athleteName;

    // Ancho ya CON el scaleX fijo aplicado (así es como se ve realmente en pantalla).
    const naturalWidthAtReference = measureAthleteTextWidth(text, athleteNameReferenceFontSize);
    const scaledWidthAtReference = naturalWidthAtReference * athleteNameBaseScaleX;
    const sizeFromWidth = scaledWidthAtReference > f.maxWidth
      ? athleteNameReferenceFontSize * (f.maxWidth / scaledWidthAtReference) // excede el ancho incluso con el scaleX fijo -> se achica el fontSize completo
      : athleteNameReferenceFontSize;

    // El scaleX es horizontal solamente, así que el alto se mide SIN él. Cubre
    // el caso de acentos/diéresis (Ñ, Á, Ü...) que pueden ser más altos que
    // las mayúsculas simples con las que se calibró la referencia.
    const heightAtReference = measureAthleteTextHeight(text, athleteNameReferenceFontSize);
    const sizeFromHeight = heightAtReference > f.maxHeight
      ? athleteNameReferenceFontSize * (f.maxHeight / heightAtReference)
      : athleteNameReferenceFontSize;

    // El más chico de los dos gana -- nunca se excede ni el ancho (ya
    // considerando el scaleX fijo) ni el alto, y nunca se agranda más allá
    // de la referencia calibrada contra TORRES.
    return Math.min(sizeFromWidth, sizeFromHeight);
  }

  function buildAthleteNameText(text) {
    const f = TEMPLATE.fields.athleteName;
    return new fabric.Text(text, {
      left: f.centerX, top: f.centerY,
      fontFamily: f.fontFamily,
      fontWeight: f.fontWeight,
      fontStyle: f.fontStyle,
      fontSize: fitAthleteNameFontSize(text),
      scaleX: athleteNameBaseScaleX, // FIJO -- igual para todos los nombres, nunca recalculado por texto
      scaleY: 1,                     // nunca se toca -- el estiramiento es SOLO horizontal
      fill: f.fill,
      originX: f.originX,
      originY: f.originY
    });
  }

  // --- Fit to View: escala SOLO la representación en pantalla del canvas ---
  // No toca canvas.width/canvas.height (el backing store nativo que usa
  // toDataURL() para el export), ni las coordenadas/tamaños de los objetos
  // del template. Usa el mecanismo propio de Fabric para esto:
  // setDimensions(dims, {cssOnly:true}) reescala únicamente los estilos CSS
  // del wrapper .canvas-container y de los dos <canvas> que Fabric genera
  // internamente (el "lower" de render y el "upper" de interacción),
  // dejando canvas.width/canvas.height intactos.
  //
  // BUG REAL encontrado en producción (Vercel) y confirmado inspeccionando el
  // código fuente real de fabric.js 5.3.0 tal como corre en el navegador:
  // StaticCanvas.prototype.setDimensions SOLO agrega la unidad "px" a cada
  // valor cuando options.cssOnly es FALSO; con cssOnly:true asume que el
  // caller ya mandó un string CSS válido y lo asigna tal cual a
  // lowerCanvasEl.style / upperCanvasEl.style / wrapperEl.style. Pasar un
  // NÚMERO (p.ej. 529) con cssOnly:true hace que el navegador reciba
  // style.width = 529 (sin unidad) -- un valor CSS inválido que el motor de
  // estilos ignora en silencio, dejando el canvas y su .canvas-container
  // trabados en su tamaño original de 1254px. Esto, combinado con el cambio
  // de #canvas-wrap a overflow:hidden, era la causa exacta del preview en
  // blanco: el canvas seguía a tamaño nativo (1254x1254) pero recortado por
  // overflow:hidden, y como fabric.Canvas.prototype._setCssDimension también
  // reescribe wrapperEl.style (el propio .canvas-container), ese wrapper
  // quedaba con un ancho "usado" distinto al de sus hijos posicionados en
  // absoluto, produciendo el recorte visible en el reporte. Verificado
  // reproduciendo ambos casos (número crudo vs. string con "px") sobre un
  // fabric.Canvas de prueba cargado con la MISMA build de fabric.js 5.3.0
  // del CDN: con número crudo el estilo no cambia; con "529px" cambia
  // correctamente, y canvas.width/height (backstore) se mantienen intactos
  // en ambos casos.
  //
  // FIX: pasar los valores como strings CSS ("<px>px"), no como números.
  const CANVAS_PREVIEW_PADDING = 24; // px de aire visual dentro de #canvas-wrap
  function fitCanvasToPreview() {
    if (!canvas) return;
    const wrap = document.getElementById('canvas-wrap');
    const availableWidth = wrap.clientWidth - CANVAS_PREVIEW_PADDING * 2;
    const availableHeight = wrap.clientHeight - CANVAS_PREVIEW_PADDING * 2;
    if (availableWidth <= 0 || availableHeight <= 0) return;
    const scale = Math.min(
      availableWidth / TEMPLATE.canvas.width,
      availableHeight / TEMPLATE.canvas.height
    );
    // Nunca agrandar más allá de la resolución nativa -- solo achicar la
    // representación en pantalla cuando el panel es más chico que 1254x1254.
    const displayScale = Math.min(scale, 1);
    canvas.setDimensions(
      {
        width: (TEMPLATE.canvas.width * displayScale) + 'px',
        height: (TEMPLATE.canvas.height * displayScale) + 'px'
      },
      { cssOnly: true }
    );

    // SEGUNDO BUG REAL encontrado en producción (canvas en blanco hasta la
    // primera interacción) -- confirmado igual que el anterior, leyendo el
    // código fuente real de fabric.js 5.3.0 desde el navegador y
    // reproduciéndolo en un canvas de prueba con getImageData():
    //
    // setDimensions() SIEMPRE llama a _initRetinaScaling() (incluso con
    // cssOnly:true). En pantallas con devicePixelRatio > 1 (Retina/HiDPI --
    // confirmado en el navegador de prueba: 1.104), _initRetinaScaling()
    // hace lowerCanvasEl.setAttribute('width', ...) / ('height', ...) sobre
    // el <canvas> real. Reasignar el atributo width/height de un <canvas>
    // SIEMPRE limpia su bitmap ya dibujado -- es un efecto de la spec HTML,
    // ocurre incluso si el valor asignado es idéntico al que ya tenía. Y
    // como este cssOnly:true es precisamente lo que le dice a Fabric que
    // NO haga su propio requestRenderAll() al final (así evita un repintado
    // innecesario cuando de verdad no cambió nada) -- en este caso SÍ se
    // limpió el bitmap como side effect, y nadie vuelve a pintarlo. El
    // canvas queda en blanco hasta que otro código (el handler de
    // nombre/bandera) llama a canvas.renderAll() por su cuenta -- por eso
    // aparecía todo recién al primer input del usuario.
    //
    // Reproducido en aislado: render→rojo opaco antes; setDimensions(css
    // Only:true) sin repintar después→pixel totalmente transparente
    // (0,0,0,0); renderAll() posterior→vuelve a rojo opaco. Coincide exacto
    // con el bug reportado.
    //
    // FIX: forzar un repintado explícito después de aplicar el tamaño CSS.
    // calcOffset() NO hace falta agregarlo aparte -- setDimensions() ya lo
    // llama internamente (se confirmó leyendo su código fuente). Tampoco
    // hace falta envolver esto en un requestAnimationFrame manual --
    // requestRenderAll() ya es fabric.util.requestAnimFrame(...) por dentro,
    // así que ya se ejecuta en el próximo frame por sí solo. Esto cubre
    // tanto la carga inicial como cualquier resize posterior (ventana o
    // panel) en pantallas Retina/HiDPI, no solo el primer render.
    canvas.requestRenderAll();
  }

  async function init() {
    canvas = new fabric.Canvas('design-canvas-el', {
      width: TEMPLATE.canvas.width,
      height: TEMPLATE.canvas.height,
      selection: false,       // nadie puede hacer selección de área en este canvas
      hoverCursor: 'default'
    });

    // El área de estado es SOLO para errores reales o estados temporales con
    // sentido (p.ej. "Cargando..."), nunca para confirmar éxito -- por eso al
    // final de un init() sin errores se deja vacía en vez de mostrar "Listo.".
    // Esta bandera evita que ese vaciado al final borre un error real que ya
    // se haya mostrado antes en el mismo init() (p.ej. el manifest.json de
    // banderas faltante, más abajo).
    let statusHasError = false;

    // Hay que confirmar que Quantico (700, itálica) ya cargó ANTES de medir o
    // dibujar texto -- si no, el fit-to-width/alto se calcularía con las
    // métricas de la fuente de fallback del navegador y quedaría mal
    // calibrado desde el arranque (y el scaleX base saldría mal también). El
    // descriptor debe coincidir exactamente con fontWeight/fontStyle usados
    // en TEMPLATE.fields.athleteName.
    try {
      await document.fonts.load('italic 700 100px "Quantico"');
      await document.fonts.ready;
    } catch (err) {
      console.warn('No se pudo confirmar la carga de la fuente Quantico:', err.message);
    }

    // El listado de países se carga aparte de la composición del canvas,
    // para que un manifest.json faltante no tumbe el resto del preview.
    let countryCodes = [];
    try {
      countryCodes = await loadCountryManifest();
      populateCountrySelect(countryCodes);
    } catch (err) {
      console.error('No se pudo cargar el listado de países:', err.message);
      countrySelect.innerHTML = '<option value="">No disponible</option>';
      statusHasError = true;
      setStatus('Faltan los assets de banderas (public/assets/design-studio/flags/). Ver instrucciones del repo.');
    }

    // Orden de capas pedido explícitamente:
    // shirtMockup -> garmentBranding/neckLabel -> countryFlag -> semperMark
    // -> athleteName -> semperCrossfitUsaArtwork. Todas las capas fijas usan
    // coordenadas absolutas de canvas (fitObjectInSlot) y se bloquean
    // individualmente -- ningún fabric.Group en el medio.
    shirtMockup = lockObject(await loadImageAsPromise(TEMPLATE.shirtMockup.src));
    shirtMockup.set({ left: 0, top: 0, originX: 'left', originY: 'top' });
    canvas.add(shirtMockup);
    shirtMockup.moveTo(0); // capa base, siempre al fondo

    // --- Garment branding: etiqueta de cuello (S mark + SEMPER + talla L) ---
    // Branding de la PRENDA, no del diseño del cliente -- capa propia, fija,
    // bloqueada, asset oficial de JMN usado tal cual.
    neckLabelObj = lockObject(await loadFixedArtwork(NECK_LABEL_SPEC));
    canvas.add(neckLabelObj);

    // --- Country flag ---
    if (countryCodes.includes(TEMPLATE.fields.countryFlag.countryCode)) {
      await new Promise((resolve) => loadFlag(TEMPLATE.fields.countryFlag.countryCode, resolve));
    }
    // Si no hay manifest/assets de banderas todavía, se deja el canvas sin
    // bandera en vez de romper el resto del preview.

    // --- Semper mark (ícono S real, no aproximado) ---
    semperMarkObj = lockObject(await loadFixedArtwork(DESIGN_GROUP_SPEC.semperMark));
    canvas.add(semperMarkObj);

    // --- Athlete name ---
    calibrateAthleteNameReferenceSize();
    athleteNameObj = lockObject(buildAthleteNameText(nameInput.value));
    canvas.add(athleteNameObj);

    // --- Línea + "SEMPER CROSSFIT" + caja "USA" (artwork oficial, no reconstruido) ---
    semperCrossfitUsaObj = lockObject(await loadStraightArtwork(DESIGN_GROUP_SPEC.semperCrossfitArtwork));
    canvas.add(semperCrossfitUsaObj);

    canvas.renderAll();
    // Sin mensaje de éxito visible para el cliente -- pedido explícito. El
    // área de estado se deja vacía (salvo que ya tenga un error real
    // pendiente de la carga del manifest de países, que no se debe pisar).
    if (!statusHasError && !flagIsLoading) {
      setStatus('');
    }
    templateReady = true;
    enableControls();

    // --- Fit to View ---
    // Tamaño inicial en pantalla + reajuste ante cualquier cambio de tamaño
    // real de #canvas-wrap (ventana del navegador, o el panel derecho
    // cambiando de ancho/alto). Solo afecta el CSS del canvas -- resolución
    // interna, coordenadas del template y export quedan intactos.
    fitCanvasToPreview();
    const canvasWrapEl = document.getElementById('canvas-wrap');
    if (window.ResizeObserver) {
      new ResizeObserver(() => fitCanvasToPreview()).observe(canvasWrapEl);
    } else {
      // Fallback para navegadores sin ResizeObserver: al menos cubre el
      // caso de resize de ventana completa.
      window.addEventListener('resize', fitCanvasToPreview);
    }

    // -----------------------------------------------------------------
    // CHECKPOINT DE DEBUG TEMPORAL — pedido explícitamente para auditar el
    // bug de coordenadas de designGroup. Solo hace console.table/console.log;
    // no toca canvas.toDataURL() ni el export, así que no puede filtrarse al
    // PNG. Borrar este bloque una vez confirmada la corrección en Vercel.
    // -----------------------------------------------------------------
    (function debugReportBoundingBoxes() {
      const report = (label, obj) => {
        if (!obj) return { element: label, present: false };
        const r = obj.getBoundingRect(true); // left/top/width/height reales en coords de canvas, post-transform
        return {
          element: label,
          present: true,
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
          scaleX: +obj.scaleX.toFixed(3),
          scaleY: +obj.scaleY.toFixed(3)
        };
      };
      const rows = [
        report('shirtMockup', shirtMockup),
        report('neckLabel (garmentBranding)', neckLabelObj),
        report('countryFlag (' + TEMPLATE.fields.countryFlag.countryCode + ')', countryFlagObj),
        report('semperMark', semperMarkObj),
        report('athleteName (' + JSON.stringify(nameInput.value) + ')', athleteNameObj),
        report('semperCrossfitUsaArtwork', semperCrossfitUsaObj)
      ];
      console.log('%c[JMN Design Studio] Checkpoint de bounding boxes reales:', 'font-weight:bold');
      if (console.table) console.table(rows); else console.log(rows);
    })();
  }

  let templateReady = false;
  function enableControls() {
    if (flagIsLoading || !templateReady) return;
    downloadBtn.disabled = false;
    downloadBtn.classList.add('enabled');
    artworkDownloadBtn.disabled = false;
    artworkDownloadBtn.classList.add('enabled');
  }

  // --- Athlete Name: edición en vivo (con auto-ajuste de tamaño por ancho) ---
  nameInput.addEventListener('input', () => {
    if (!athleteNameObj) return; // canvas aún no terminó de montarse
    const text = nameInput.value;
    athleteNameObj.set({ text, fontSize: fitAthleteNameFontSize(text) });
    canvas.renderAll();
  });

  // --- Country / Flag: swap en vivo ---
  countrySelect.addEventListener('change', () => {
    const code = countrySelect.value;
    if (!code || !canvas) return;
    loadFlag(code);
  });

  function inkBounds(surface) {
    const { width, height } = surface;
    const data = surface.getContext('2d').getImageData(0, 0, width, height).data;
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (right < left) throw new Error('Empty artwork');
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
  }

  // PNG pHYs uses integer pixels/metre. Replace any existing density chunk.
  function pngWithPrintDensity(dataURL, dpi) {
    const bytes = Uint8Array.from(atob(dataURL.split(',')[1]), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const chunk = new Uint8Array(21);
    const cv = new DataView(chunk.buffer);
    cv.setUint32(0, 9);
    chunk.set([112, 72, 89, 115], 4);
    cv.setUint32(8, Math.round(dpi / 0.0254));
    cv.setUint32(12, Math.round(dpi / 0.0254));
    chunk[16] = 1;
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 17)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    cv.setUint32(17, (crc ^ 0xffffffff) >>> 0);
    const parts = [bytes.subarray(0, 8)];
    for (let offset = 8; offset < bytes.length;) {
      const length = view.getUint32(offset) + 12;
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type !== 'pHYs') parts.push(bytes.subarray(offset, offset + length));
      if (type === 'IHDR') parts.push(chunk);
      offset += length;
    }
    let binary = '';
    for (const part of parts) for (let i = 0; i < part.length; i += 8192) {
      binary += String.fromCharCode(...part.subarray(i, i + 8192));
    }
    return 'data:image/png;base64,' + btoa(binary);
  }

  // --- Download PNG ---
  async function downloadDesign(artworkOnly = false) {
    if(Date.now() >= expiresAt){onUnavailable();return;}
    if (!canvas || flagIsLoading || !templateReady) return;
    const garmentLayers = [shirtMockup, neckLabelObj].filter(Boolean);
    const visibility = garmentLayers.map(obj => obj.visible);
    const background = canvas.backgroundColor;
    let dataURL;
    try {
      if (artworkOnly) {
        garmentLayers.forEach(obj => obj.set('visible', false));
        canvas.backgroundColor = '';
      }
      if (artworkOnly) {
        const native = canvas.toCanvasElement(1);
        const bounds = inkBounds(native);
        dataURL = canvas.toDataURL({ format: 'png', enableRetinaScaling: false,
          left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
          multiplier: 3600 / bounds.width });
        dataURL = pngWithPrintDensity(dataURL, 300);
      } else {
        dataURL = canvas.toDataURL({ format: 'png', enableRetinaScaling: false });
      }
    } catch (err) {
      setStatus('Export failed. Please try again.');
      return;
    } finally {
      garmentLayers.forEach((obj, i) => obj.set('visible', visibility[i]));
      canvas.backgroundColor = background;
      canvas.requestRenderAll();
    }
    try {
      downloadBtn.disabled=artworkDownloadBtn.disabled=true;
      const response=await fetch('/api/design-export',{method:'POST',headers:{Authorization:'Bearer '+sessionToken,'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({slug,mode:artworkOnly?'artwork':'mockup',png:dataURL})});
      if(!response.ok){if([401,403,404].includes(response.status))onUnavailable();else setStatus('Export failed. Please try again.');return;}
      if(Date.now() >= expiresAt){onUnavailable();return;}
      const objectUrl=URL.createObjectURL(await response.blob());
      const link=document.createElement('a');link.href=objectUrl;
      link.download=slug+(artworkOnly?'-artwork-12in-300dpi':'-mockup')+'.png';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    } catch {setStatus('Export failed. Please try again.');}
    finally {enableControls();}
  }
  downloadBtn.addEventListener('click', () => downloadDesign());
  artworkDownloadBtn.addEventListener('click', () => downloadDesign(true));

  let flagLoadVersion = 0;
  let flagIsLoading = false;

  async function loadFlag(countryCode, onDone) {
    const version = ++flagLoadVersion;
    const slot = TEMPLATE.fields.countryFlag.slot;
    let objectUrl;
    flagIsLoading = true;
    downloadBtn.disabled = artworkDownloadBtn.disabled = true;
    setStatus('Loading flag...');
    try {
      const response = await fetch(flagPath(countryCode));
      if (!response.ok) throw new Error('Flag unavailable');
      const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid flag');
      const svg = doc.documentElement;
      const viewBox = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
      const ratio = viewBox[2] / viewBox[3];
      if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Invalid flag dimensions');
      // Let the browser render SVG markers, clipping and transforms faithfully.
      // Explicit dimensions exceed the flag's native export slot by at least 8x for the 3600px print export.
      const width = Math.ceil(Math.max(slot.width * 8, slot.height * 8 * ratio));
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(Math.ceil(width / ratio)));
      objectUrl = URL.createObjectURL(new Blob(
        [new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }
      ));
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Flag render failed'));
        element.src = objectUrl;
      });
      // Freeze browser rendering into a high-resolution bitmap for Fabric/export.
      const surface = document.createElement('canvas');
      surface.width = image.naturalWidth;
      surface.height = image.naturalHeight;
      surface.getContext('2d').drawImage(image, 0, 0);
      if (version !== flagLoadVersion) return;
      const flagArt = new fabric.Image(surface);
      fitObjectInSlot(flagArt, slot, surface.width, surface.height);
      if (countryFlagObj) canvas.remove(countryFlagObj);
      countryFlagObj = lockObject(flagArt);
      canvas.add(countryFlagObj);
      canvas.renderAll();
      setStatus('');
      flagIsLoading = false;
      enableControls();
    } catch (err) {
      if (version === flagLoadVersion) {
        setStatus('Flag could not load. Select the country again to retry.');
        // Keep exports disabled so an old flag cannot be downloaded by mistake.
      }
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (onDone) onDone();
    }
  }


  document.getElementById('template-name').textContent=name;
  TEMPLATE.shirtMockup.src=assets.shirtMockup;
  DESIGN_GROUP_SPEC.semperMark.src=assets.semperMark;
  DESIGN_GROUP_SPEC.semperCrossfitArtwork.src=assets.semperCrossfitUsa;
  NECK_LABEL_SPEC.src=assets.neckLabel;
  init().catch(()=>{templateReady=false;downloadBtn.disabled=artworkDownloadBtn.disabled=true;setStatus('Template could not load. Please reopen Design Studio.');});

}
