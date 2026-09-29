/* ============================================================
   CÓDIGO TINTO — Lógica Frontend y Conexión con Endpoints PHP
   - Persistencia de Carrito en localStorage
   - Conexión AJAX con API REST en PHP / MySQL (MariaDB 3307)
   - Compresión con Canvas (Client-Side Lossy Compression)
   - Control de Sesión y Roles (Cliente, Admin, SEO)
============================================================ */

$(document).ready(function () {
  // 1. Detección dinámica de la ruta base hacia /api/
  window.API_BASE = determinarRutaApi();

  // 2. Inicialización de componentes e interfaz
  actualizarContadorCarrito();
  cargarCarritoEnTabla();
  if ($("#carrito-body").length > 0) sincronizarStockCarrito();
  verificarEstadoSesion();
  configurarEstrellas();

  // Si estamos en una página con catálogo (index.html o catalogo.html)
  if ($("#catalogo-grid").length > 0) {
    cargarProductosDesdeBD();
    configurarFiltrosCatalogo();
  }

  // Si estamos en el panel de administración (productos-crud.html)
  if ($("#tabla-productos-admin").length > 0) {
    cargarProductosAdmin();
    configurarSubidaProductoConCanvas();
    $(window).on("focus", cargarProductosAdmin);
  }

  // ------------------------------------------------------------
  // CARRITO: Agregar productos desde el Catálogo con Cantidad
  // ------------------------------------------------------------
  $(document).on("click", ".btn-agregar-catalogo", function (e) {
    e.preventDefault();
    const btn = $(this);
    const card = btn.closest(".card-vino");
    
    const id = parseInt(btn.data("id"));
    const nombre = card.find(".prod-nombre").text().trim();
    const precio = parseFloat(btn.data("precio")) || 0;
    const imagen = card.find("img").attr("src") || "assets/img/productos/default.jpg";
    const stockDisponible = parseInt(card.find(".cant-prod").attr("max")) || 0;
    
    // Obtiene la cantidad del input numérico dentro de la tarjeta
    const inputCant = card.find(".cant-prod");
    let cantidad = parseInt(inputCant.val()) || 1;
    if (cantidad < 1) {
      cantidad = 1;
      inputCant.val(1);
    }

    if (stockDisponible <= 0 || btn.prop("disabled")) {
      alert("❌ Este producto no tiene stock disponible en este momento.");
      return;
    }

    if (cantidad > stockDisponible) {
      cantidad = stockDisponible;
      inputCant.val(stockDisponible);
      marcarCantidadInvalida(inputCant);
      alert(`⚠️ Solo quedan ${stockDisponible} unidades disponibles de este producto.`);
    }

    agregarAlCarrito(id, nombre, precio, cantidad, imagen, stockDisponible);

    // Animación de feedback visual en el botón
    const textoOriginal = btn.text();
    btn.text(`✓ Añadido (${cantidad})`).addClass("btn-success").removeClass("btn-tinto");
    setTimeout(() => {
      btn.text(textoOriginal).removeClass("btn-success").addClass("btn-tinto");
    }, 900);
  });

  $(document).on("click keydown", ".agotado-click-target", function (e) {
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    const nombre = $(this).closest(".card-vino").find(".prod-nombre").text().trim();
    $("#alerta-stock-catalogo")
      .removeClass("d-none")
      .addClass("alert-danger")
      .text(`No se puede agregar "${nombre}" al carrito porque está agotado.`);
  });

  // Modificar cantidad en la tabla del carrito
  $(document).on("input change", ".item-cant", function () {
    const idx = $(this).data("index");
    let nuevaCant = parseInt($(this).val());
    let cart = obtenerCarrito();
    let excedioStock = false;

    if (isNaN(nuevaCant) || nuevaCant < 1) {
      nuevaCant = 1;
      $(this).val(1);
    }

    if (cart[idx]) {
      const stockMax = Number(cart[idx].stock ?? $(this).attr("max"));
      if (nuevaCant > stockMax) {
        nuevaCant = stockMax;
        $(this).val(stockMax);
        excedioStock = true;
        alert(`⚠️ Solo quedan ${stockMax} unidades disponibles de este producto.`);
      }
    }

    if (cart[idx]) {
      cart[idx].cantidad = nuevaCant;
      guardarCarrito(cart);
      cargarCarritoEnTabla();
      if (excedioStock) {
        marcarCantidadInvalida($(`.item-cant[data-index="${idx}"]`));
      }
    }
  });

  // Eliminar un ítem individual
  $(document).on("click", ".btn-eliminar-item", function () {
    const idx = $(this).data("index");
    let cart = obtenerCarrito();
    cart.splice(idx, 1);
    guardarCarrito(cart);
    cargarCarritoEnTabla();
  });

  // Vaciar carrito
  $("#btn-vaciar-carrito").on("click", function () {
    const cart = obtenerCarrito();
    if (cart.length === 0) return alert("El carrito ya está vacío.");

    if (confirm("¿Deseas vaciar todos los productos seleccionados?")) {
      localStorage.removeItem("codigo_tinto_cart");
      actualizarContadorCarrito();
      cargarCarritoEnTabla();
    }
  });

  // ------------------------------------------------------------
  // AUTH: Registro con validación de Mayoría de Edad (+18) y CI
  // ------------------------------------------------------------
  $("#form-registro").on("submit", function (e) {
    e.preventDefault();

    const username = $("#reg-username").val().trim();
    const correo = $("#reg-correo").val().trim();
    const contrasena = $("#reg-contrasena").val();
    const ci = $("#reg-ci").val().trim();
    const fechaNac = $("#reg-fecha-nac").val();
    const telefono = $("#reg-telefono").val().trim();

    if (!username || !correo || !contrasena || !ci || !fechaNac) {
      alert("Por favor completa todos los campos obligatorios.");
      return;
    }

    // Validación preventiva en el cliente
    const fechaNacDate = new Date(fechaNac);
    const hoy = new Date();
    let edad = hoy.getFullYear() - fechaNacDate.getFullYear();
    const mes = hoy.getMonth() - fechaNacDate.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNacDate.getDate())) edad--;

    if (edad < 18) {
      alert("❌ ACCESO DENEGADO: Debes ser mayor de 18 años para comprar bebidas alcohólicas.");
      return;
    }

    $.ajax({
      url: `${window.API_BASE}auth.php?accion=registro`,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        username: username,
        correo: correo,
        contrasena: contrasena,
        ci: ci,
        fecha_nacimiento: fechaNac,
        telefono: telefono
      }),
      success: function (res) {
        if (res.status === "ok") {
          alert("✅ " + res.mensaje);
          window.location.href = "login.html";
        } else {
          alert("Error: " + res.mensaje);
        }
      },
      error: function (xhr) {
        alert("Error de comunicación con el servidor al registrar.");
      }
    });
  });

  // ------------------------------------------------------------
  // AUTH: Login real con Roles
  // ------------------------------------------------------------
  $("#form-login").on("submit", function (e) {
    e.preventDefault();

    const usuarioOCorreo = $("#login-usuario").val().trim();
    const contrasena = $("#login-password").val();

    $.ajax({
      url: `${window.API_BASE}auth.php?accion=login`,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        usuario_o_correo: usuarioOCorreo,
        contrasena: contrasena
      }),
      success: function (res) {
        if (res.status === "ok") {
          sessionStorage.setItem("codigo_tinto_user", JSON.stringify(res.usuario));
          alert(`¡Bienvenido, ${res.usuario.username}! Rol: ${res.usuario.Rol}`);

          // Redirección inteligente por rol
          if (res.usuario.Rol === "Admin" || res.usuario.Rol === "SEO") {
            window.location.href = obtenerRutaRelativa("pages/admin/productos-crud.html");
          } else {
            window.location.href = obtenerRutaRelativa("index.html");
          }
        } else {
          alert("❌ " + res.mensaje);
        }
      },
      error: function () {
        alert("Error de conexión al intentar iniciar sesión.");
      }
    });
  });

  // Cerrar Sesión
  $(document).on("click", "#btn-logout", function (e) {
    e.preventDefault();
    $.ajax({
      url: `${window.API_BASE}auth.php?accion=logout`,
      method: "POST",
      complete: function () {
        sessionStorage.removeItem("codigo_tinto_user");
        alert("Sesión cerrada.");
        window.location.href = obtenerRutaRelativa("index.html");
      }
    });
  });

  // Proteger el acceso al checkout desde el carrito.
  $(document).on("click", "#btn-checkout", function (e) {
    if (!sessionStorage.getItem("codigo_tinto_user")) {
      e.preventDefault();
      alert("Debes iniciar sesión para comprar.");
      window.location.href = obtenerRutaRelativa("pages/login.html");
    }
  });

  // ------------------------------------------------------------
  // CHECKOUT: Pedido GPS y Facturación en Tiempo Real
  // ------------------------------------------------------------
  $("#form-checkout").on("submit", function (e) {
    e.preventDefault();

    const cart = obtenerCarrito();
    if (cart.length === 0) return alert("Tu carrito está vacío.");

    const sesion = JSON.parse(sessionStorage.getItem("codigo_tinto_user"));
    if (!sesion) {
      alert("Debes iniciar sesión para confirmar tu compra.");
      window.location.href = "login.html";
      return;
    }

    const nitCi = $("#checkout-nit-ci").val().trim() || sesion.ci;
    const razonSocial = $("#checkout-razon-social").val().trim() || sesion.username;
    const direccionRef = $("#checkout-direccion").val().trim();
    const metodoPagoId = parseInt($("#checkout-metodo-pago").val()) || 1;
    const lat = parseFloat($("#checkout-lat").val()) || -21.5355;
    const lng = parseFloat($("#checkout-lng").val()) || -64.7296;

    const items = cart.map((i) => ({
      id_producto: i.id,
      cantidad: i.cantidad,
      precio_unitario: i.precio
    }));

    const total = cart.reduce((acc, it) => acc + it.precio * it.cantidad, 0);

    const payload = {
      cuenta_id: sesion.id,
      metodo_pago_id: metodoPagoId,
      latitud: lat,
      longitud: lng,
      direccion_referencia: direccionRef,
      tiempo_estimado_min: 30,
      total: total,
      nit_ci: nitCi,
      razon_social: razonSocial,
      items: items
    };

    $("#btn-confirmar-pedido").prop("disabled", true).text("Procesando despacho...");

    $.ajax({
      url: `${window.API_BASE}pedidos.php`,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify(payload),
      success: function (res) {
        if (res.status === "ok") {
          localStorage.removeItem("codigo_tinto_cart");
          alert(`✅ ¡Pedido exitoso!\nNro de Orden: #${res.id_pedido}\nFactura Fiscal: ${res.nro_factura}`);
          window.location.href = `factura.html?id_pedido=${res.id_pedido}`;
        } else {
          alert("Error al procesar pedido: " + res.mensaje);
          $("#btn-confirmar-pedido").prop("disabled", false).text("Confirmar Pedido");
        }
      },
      error: function () {
        alert("Error de servidor al procesar el pedido.");
        $("#btn-confirmar-pedido").prop("disabled", false).text("Confirmar Pedido");
      }
    });
  });
});

/* ============================================================
   FUNCIONES DEL CATÁLOGO (Carga desde MySQL y Filtros)
============================================================ */

function cargarProductosDesdeBD(categoria = "todos", epoca = "todas", buscar = "") {
  const $grid =$("#catalogo-grid");
  $grid.html('<div class="col-12 text-center text-secondary py-5">Cargando bodega...</div>');
  $("#alerta-stock-catalogo").addClass("d-none").text("");

  let url = `${window.API_BASE}productos.php?categoria=${categoria}&epoca=${epoca}`;
  if (buscar) url += `&buscar=${encodeURIComponent(buscar)}`;

  $.ajax({
    url: url,
    method: "GET",
    dataType: "json",
    success: function (res) {
      $grid.empty();
      const productos = Array.isArray(res && res.data) ? res.data : [];
      actualizarMetricasCatalogo(productos);

      if (res.status !== "ok" || productos.length === 0) {
        $grid.html('<div class="col-12 text-center text-muted py-5">No se encontraron productos con estos criterios.</div>');
        return;
      }

      productos.forEach((p) => {
        const ratingNum = parseFloat(p.rating_promedio).toFixed(1);
        const estrellasHtml = "★".repeat(Math.round(p.rating_promedio)) + "☆".repeat(5 - Math.round(p.rating_promedio));

        const stock = Math.max(0, parseInt(p.stock, 10) || 0);
        const sinStock = stock === 0;
        const stockBadge = `<span class="badge stock-badge bg-dark border border-secondary text-secondary">${stock} disp.</span>`;

        $grid.append(`
          <div class="col-md-4 item-producto" data-categoria="${p.categoria_slug}">
            <div class="card card-vino h-100 p-3 rounded-3 d-flex flex-column">
              <span class="badge bg-secondary mb-2 w-auto align-self-start">${p.categoria_nombre}</span>
              <div class="prod-img-wrap mb-2">
                <img src="${p.imagen_url}" alt="${p.nombre}" loading="lazy">
              </div>
              <h5 class="fw-bold text-white mb-1 prod-nombre">${p.nombre}</h5>
              <p class="text-secondary small mb-2 flex-grow-1">${p.descripcion || "Vino tarijeño de alta calidad."}</p>
              <div class="text-warning small mb-2" title="${ratingNum}/5 estrellas">
                ${estrellasHtml} <span class="text-muted">(${p.total_resenas || 0})</span>
              </div>
              
              <div class="mt-auto">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fs-5 fw-bold text-warning prod-precio">Bs. ${parseFloat(p.precio).toFixed(2)}</span>
                  ${stockBadge}
                </div>
                <!-- Control de cantidad y botón -->
                <div class="input-group input-group-sm">
                  <input type="number" class="form-control bg-dark text-light border-secondary text-center cant-prod" value="${sinStock ? 0 : 1}" min="1" max="${stock}" ${sinStock ? "disabled" : ""}>
                  ${sinStock ? `
                    <span class="agotado-control">
                      <button class="btn btn-tinto btn-agotado fw-bold" type="button" disabled>Agotado</button>
                      <span class="agotado-click-target" role="button" tabindex="0" aria-label="Avisar que ${p.nombre} está agotado"></span>
                    </span>
                  ` : `
                    <button class="btn btn-tinto btn-agregar-catalogo fw-bold" data-id="${p.id_producto}" data-precio="${p.precio}">
                      + Carrito
                    </button>
                  `}
                </div>
              </div>
            </div>
          </div>
        `);

        if (sinStock) {
          const $producto = $grid.children().last();
          $producto.find(".stock-badge")
            .removeClass("bg-dark border border-secondary text-secondary")
            .addClass("bg-danger")
            .text("Agotado");
          $producto.find(".btn-agotado")
            .removeClass("btn-tinto")
            .addClass("btn-secondary disabled");
        }
      });
    },
    error: function () {
      actualizarMetricasCatalogo([]);
      $grid.html('<div class="col-12 text-center text-danger py-5">Error de conexión al cargar el catálogo de productos.</div>');
    }
  });
}

function actualizarMetricasCatalogo(productos) {
  const total = productos.length;
  const agotados = productos.filter((producto) => Number(producto.stock) <= 0).length;
  const disponibles = total - agotados;

  $("#metrica-total-valor").text(total);
  $("#metrica-disponibles-valor").text(disponibles);
  $("#metrica-agotados-valor").text(agotados);

  $("#metrica-total").removeClass("metric-neutral metric-ok metric-warning metric-danger").addClass(total > 0 ? "metric-neutral" : "metric-warning");
  $("#metrica-disponibles").removeClass("metric-neutral metric-ok metric-warning metric-danger").addClass(disponibles > 0 ? "metric-ok" : "metric-danger");
  $("#metrica-agotados").removeClass("metric-neutral metric-ok metric-warning metric-danger").addClass(agotados > 0 ? "metric-danger" : "metric-ok");
}

function marcarCantidadInvalida($input) {
  $input.removeClass("border-secondary").addClass("is-invalid border-danger").attr("aria-invalid", "true");
  setTimeout(() => {
    $input.removeClass("is-invalid border-danger").addClass("border-secondary").removeAttr("aria-invalid");
  }, 1200);
}

function configurarFiltrosCatalogo() {
  function dispararFiltro() {
    const texto = $("#filtro-nombre").val().trim();
    const cat = $("#filtro-categoria").val();
    const epoca = $("#filtro-epoca").val();
    cargarProductosDesdeBD(cat, epoca, texto);
  }

  let timerBusqueda;
  $("#filtro-nombre").on("input", function () {
    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(dispararFiltro, 300);
  });

  $("#filtro-categoria, #filtro-epoca").on("change", dispararFiltro);
}

/* ============================================================
   PANEL ADMIN: Compresión Canvas y Altas/Bajas
============================================================ */

function configurarSubidaProductoConCanvas() {
  let imagenBase64Procesada = "";

  // Interceptar la selección del archivo para comprimirlo en el navegador
  $("#admin-foto-input").on("change", async function () {
    const archivo = this.files[0];
    if (!archivo) return;

    $("#info-compresion").html('<span class="text-info">Procesando compresión en Canvas...</span>');

    try {
      // Llamada al módulo Canvas: Downsampling 800px + Cuantización 0.7
      const resultado = await CompresorImagen.comprimir(archivo, 800, 0.7);
      imagenBase64Procesada = resultado.base64;

      $("#preview-subida").attr("src", imagenBase64Procesada).removeClass("d-none");

      const pesoOrigKB = (resultado.pesoOriginalBytes / 1024).toFixed(1);
      const pesoFinalKB = (resultado.pesoFinalBytes / 1024).toFixed(1);

      $("#info-compresion").html(`
        ⚡ Optimizado: <strong class="text-secondary">${pesoOrigKB} KB</strong> &rarr; 
        <strong class="text-warning">${pesoFinalKB} KB</strong> (${resultado.ancho}x${resultado.alto}px)
      `);
    } catch (err) {
      alert("Error al comprimir: " + err.message);
      $("#info-compresion").text("");
    }
  });

  // Guardar en Base de Datos
  $("#form-subir-producto").on("submit", function (e) {
    e.preventDefault();

    const idEditando = $("#admin-id-producto").val();
    if (!imagenBase64Procesada && !idEditando) {
      alert("Por favor selecciona una foto para el producto.");
      return;
    }

    if (!imagenBase64Procesada && idEditando) {
      alert("La imagen del producto se conserva en la edición actual.");
      return;
    }

    const payload = {
      id_producto: idEditando ? parseInt(idEditando) : undefined,
      id_categoria: parseInt($("#admin-cat").val()),
      id_temporada: parseInt($("#admin-temp").val()),
      nombre: $("#admin-nombre").val().trim(),
      descripcion: $("#admin-desc").val().trim(),
      cepa: $("#admin-cepa").val().trim(),
      graduacion_alcoholica: parseFloat($("#admin-grad").val()) || 14.0,
      precio: parseFloat($("#admin-precio").val()) || 0,
      stock: parseInt($("#admin-stock").val()) || 0,
      imagen_url: imagenBase64Procesada
    };

    const method = idEditando ? "PUT" : "POST";
    const url = idEditando ? `${window.API_BASE}productos.php?id=${idEditando}` : `${window.API_BASE}productos.php`;

    $.ajax({
      url: url,
      method: method,
      contentType: "application/json",
      data: JSON.stringify(payload),
      success: function (res) {
        if (res.status === "ok") {
          alert(idEditando ? "✅ Producto actualizado correctamente." : "✅ Producto subido con éxito al catálogo.");
          $("#form-subir-producto")[0].reset();
          $("#admin-id-producto").val("");
          $("#preview-subida").addClass("d-none");
          $("#info-compresion").text("");
          imagenBase64Procesada = "";
          cargarProductosAdmin();
        } else {
          alert("Error: " + res.mensaje);
        }
      },
      error: function () {
        alert("Error de red al guardar el producto.");
      }
    });
  });

  $(document).on("click", ".btn-editar-producto", function () {
    const id = $(this).data("id");

    $.ajax({
      url: `${window.API_BASE}productos.php`,
      method: "GET",
      success: function (res) {
        const producto = (res.data || []).find((p) => Number(p.id_producto) === Number(id));
        if (!producto) {
          alert("No se encontró el producto a editar.");
          return;
        }

        $("#admin-id-producto").val(producto.id_producto);
        $("#admin-nombre").val(producto.nombre || "");
        $("#admin-cat").val(producto.id_categoria || 1);
        $("#admin-temp").val(producto.id_temporada || 1);
        $("#admin-precio").val(producto.precio || 0);
        $("#admin-stock").val(producto.stock || 0);
        $("#admin-cepa").val(producto.cepa || "");
        $("#admin-grad").val(producto.graduacion_alcoholica || 14.0);
        $("#admin-desc").val(producto.descripcion || "");
        imagenBase64Procesada = producto.imagen_url || "";

        if (producto.imagen_url) {
          $("#preview-subida").attr("src", producto.imagen_url).removeClass("d-none");
          $("#info-compresion").html('<span class="text-info">Imagen cargada para edición.</span>');
        }

        $("#form-subir-producto button[type='submit']").text("Guardar cambios");
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      error: function () {
        alert("Error al cargar el producto para editar.");
      }
    });
  });

  // Baja de producto
  $(document).on("click", ".btn-baja-producto", function () {
    const id = $(this).data("id");
    if (!confirm(`¿Dar de baja el producto #${id}? Ya no aparecerá en el catálogo comercial.`)) return;

    $.ajax({
      url: `${window.API_BASE}productos.php?id=${id}`,
      method: "DELETE",
      success: function (res) {
        if (res.status === "ok") {
          alert("Producto dado de baja.");
          cargarProductosAdmin();
        }
      }
    });
  });
}

function cargarProductosAdmin() {
  const $tbody =$("#tabla-productos-admin tbody");
  $tbody.html('<tr><td colspan="6" class="text-center py-3 text-secondary">Cargando inventario...</td></tr>');

  $.ajax({
    url: `${window.API_BASE}productos.php`,
    method: "GET",
    success: function (res) {
      $tbody.empty();
      const productos = Array.isArray(res && res.data) ? res.data : [];

      if (res.status !== "ok" || productos.length === 0) {
        $tbody.html('<tr><td colspan="6" class="text-center py-3 text-muted">No hay productos registrados.</td></tr>');
        return;
      }

      productos.forEach((p) => {
        $tbody.append(`
          <tr>
            <td>
              <img src="${p.imagen_url}" width="40" height="40" class="rounded object-fit-contain bg-dark me-2">
              <strong>${p.nombre}</strong>
            </td>
            <td>${p.categoria_nombre}</td>
            <td><span class="badge bg-secondary">${p.temporada_nombre}</span></td>
            <td>Bs. ${parseFloat(p.precio).toFixed(2)}</td>
            <td><span class="badge ${p.stock > 5 ? "bg-success" : "bg-danger"}">${p.stock} un.</span></td>
            <td>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-warning btn-editar-producto text-nowrap" data-id="${p.id_producto}">
                  ✏️ Editar
                </button>
                <button class="btn btn-sm btn-outline-danger btn-baja-producto" data-id="${p.id_producto}">
                  Dar de baja
                </button>
              </div>
            </td>
          </tr>
        `);
      });
    },
    error: function () {
      $tbody.html('<tr><td colspan="6" class="text-center py-3 text-danger">No se pudo cargar el inventario.</td></tr>');
    }
  });
}

/* ============================================================
   UTILIDADES: Persistencia de Carrito y Rutas Relativas
============================================================ */

function obtenerCarrito() {
  return JSON.parse(localStorage.getItem("codigo_tinto_cart")) || [];
}

function guardarCarrito(carrito) {
  localStorage.setItem("codigo_tinto_cart", JSON.stringify(carrito));
  actualizarContadorCarrito();
}

function sincronizarStockCarrito() {
  const carrito = obtenerCarrito();
  if (carrito.length === 0) return;
  $(".item-cant").prop("disabled", true);
  $("#btn-checkout").addClass("disabled").attr("aria-disabled", "true");

  $.ajax({
    url: `${window.API_BASE}productos.php`,
    method: "GET",
    dataType: "json",
    success: function (res) {
      if (res.status !== "ok" || !Array.isArray(res.data)) {
        $("#carrito-body").prepend('<tr><td colspan="5" class="text-center text-danger">No se pudo verificar el stock. Recarga la página antes de continuar.</td></tr>');
        alert("No se pudo verificar el stock con el servidor. El carrito queda bloqueado por seguridad.");
        return;
      }

      const productos = new Map(res.data.map((producto) => [String(producto.id_producto), producto]));
      let productosSinStock = 0;

      const carritoActualizado = carrito.filter((item) => {
        const nombreItem = String(item.nombre || "").trim().toLowerCase();
        const producto = productos.get(String(item.id ?? item.id_producto)) ||
          res.data.find((actual) => String(actual.nombre || "").trim().toLowerCase() === nombreItem);
        if (!producto) return true;

        const stock = Math.max(0, parseInt(producto.stock, 10) || 0);
        if (stock === 0) {
          productosSinStock++;
          return false;
        }

        item.id = Number(producto.id_producto);
        item.stock = stock;
        item.cantidad = Math.min(Math.max(1, parseInt(item.cantidad, 10) || 1), stock);
        return true;
      });

      guardarCarrito(carritoActualizado);
      cargarCarritoEnTabla();
      if (carritoActualizado.length > 0) {
        $("#btn-checkout").removeClass("disabled").removeAttr("aria-disabled");
      }

      if (productosSinStock > 0) {
        alert("Se quitaron del carrito los productos que ya no tienen stock.");
      }
    },
    error: function () {
      $("#carrito-body").prepend('<tr><td colspan="5" class="text-center text-danger">No se pudo verificar el stock. Recarga la página antes de continuar.</td></tr>');
      alert("No se pudo verificar el stock con el servidor. El carrito queda bloqueado por seguridad.");
    }
  });
}

function agregarAlCarrito(id, nombre, precio, cantidad, imagen, stockDisponible = 999999) {
  let carrito = obtenerCarrito();
  const index = carrito.findIndex((item) => item.id === id);

  if (index !== -1) {
    const totalEnCarrito = carrito[index].cantidad + cantidad;
    const stockMax = Number(carrito[index].stock) || stockDisponible;

    carrito[index].cantidad = Math.min(totalEnCarrito, stockMax);
    if (totalEnCarrito > stockMax) {
      alert(`⚠️ Solo quedan ${stockMax} unidades disponibles de "${carrito[index].nombre}".`);
    }
  } else {
    carrito.push({ id, nombre, precio, cantidad, imagen, stock: stockDisponible });
  }

  guardarCarrito(carrito);
}

function actualizarContadorCarrito() {
  const carrito = obtenerCarrito();
  const total = carrito.reduce((acc, item) => acc + item.cantidad, 0);
  $("#cart-count").text(total);
}

function cargarCarritoEnTabla() {
  const $tbody =$("#carrito-body");
  if ($tbody.length === 0) return;

  const carrito = obtenerCarrito();

  if (carrito.length === 0) {
    $tbody.html(`
      <tr>
        <td colspan="5" class="text-center py-4 text-secondary">
          Tu carrito está vacío. <a href="catalogo.html" class="text-warning">Ir a la bodega</a>
        </td>
      </tr>
    `);
    $("#resumen-subtotal, #resumen-total").text("Bs. 0.00");
    $("#btn-checkout").addClass("disabled");
    return;
  }

  $("#btn-checkout").removeClass("disabled");
  $tbody.empty();
  let totalGeneral = 0;

  carrito.forEach((prod, i) => {
    const subtotal = prod.precio * prod.cantidad;
    totalGeneral += subtotal;

    $tbody.append(`
      <tr>
        <td>
          <div class="d-flex align-items-center">
            <img src="${prod.imagen}" width="45" height="45" class="rounded object-fit-contain bg-dark me-2">
            <div>
              <div class="fw-bold text-white">${prod.nombre}</div>
              <small class="text-secondary">Botella 750ml</small>
            </div>
          </div>
        </td>
        <td>Bs. ${prod.precio.toFixed(2)}</td>
        <td>
          <input type="number" class="form-control form-control-sm bg-dark text-light border-secondary text-center item-cant" 
                 style="width: 70px;" data-index="${i}" value="${prod.cantidad}" min="1" max="${Math.max(1, Number(prod.stock) || 1)}">
        </td>
        <td class="text-warning fw-bold">Bs. ${subtotal.toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger btn-eliminar-item" data-index="${i}">✕</button>
        </td>
      </tr>
    `);
  });

  $("#resumen-subtotal, #resumen-total").text(`Bs. ${totalGeneral.toFixed(2)}`);
}

function verificarEstadoSesion() {
  const usuarioRaw = sessionStorage.getItem("codigo_tinto_user");
  if (!usuarioRaw) return;

  const usuario = JSON.parse(usuarioRaw);
  const $navAuth =$("#nav-auth-container");

  if ($navAuth.length > 0) {
    let panelAdminLink = "";
    if (usuario.Rol === "Admin" || usuario.Rol === "SEO") {
      panelAdminLink = `<a href="${obtenerRutaRelativa("pages/admin/productos-crud.html")}" class="btn btn-outline-warning btn-sm">Panel Admin</a>`;
    }

    $navAuth.html(`
      <span class="text-secondary small d-none d-md-inline align-self-center">Hola, <strong class="text-light">${usuario.username}</strong></span>
      ${panelAdminLink}
      <button id="btn-logout" class="btn btn-outline-danger btn-sm">Salir</button>
    `);
  }
}

function configurarEstrellas() {
  $("#star-rating span").on("click", function () {
    const val = $(this).data("star");
    $("#star-rating span").each(function (i) {
      if (i < val) $(this).addClass("text-warning").removeClass("text-secondary");
      else $(this).addClass("text-secondary").removeClass("text-warning");
    });
    $("#calificacion-valor").val(val);
  });
}

function determinarRutaApi() {
  const path = window.location.pathname;
  if (path.includes("/pages/admin/")) return "../../api/";
  if (path.includes("/pages/")) return "../api/";
  return "api/";
}

function obtenerRutaRelativa(destino) {
  const path = window.location.pathname;
  if (path.includes("/pages/admin/")) return `../../${destino}`;
  if (path.includes("/pages/")) return `../${destino}`;
  return destino;
}