/* ============================================================
   CÓDIGO TINTO — Módulo de Procesamiento Digital de Imágenes
   Técnica: Client-Side Lossy Compression + Spatial Downsampling
============================================================ */

const CompresorImagen = {
  /**
   * Procesa y comprime una imagen localmente en el navegador.
   * @param {File} archivo - Archivo obtenido directamente del <input type="file">
   * @param {number} maxAncho - Límite de ancho en píxeles (default: 800px)
   * @param {number} factorCalidad - Calidad de cuantización DCT (0.1 a 1.0, default: 0.7)
   * @returns {Promise<string>} Cadena Base64 optimizada (data:image/jpeg;base64,...)
   */
  comprimir: function (archivo, maxAncho = 800, factorCalidad = 0.7) {
    return new Promise((resolve, reject) => {
      if (!archivo || !archivo.type.startsWith("image/")) {
        return reject(new Error("El archivo seleccionado no es un formato de imagen compatible."));
      }

      const lector = new FileReader();
      lector.readAsDataURL(archivo);

      lector.onload = function (e) {
        const imagen = new Image();
        imagen.src = e.target.result;

        imagen.onload = function () {
          let anchoOriginal = imagen.width;
          let altoOriginal = imagen.height;
          let nuevoAncho = anchoOriginal;
          let nuevoAlto = altoOriginal;

          // 1. Spatial Downsampling: Reducción de resolución conservando Aspect Ratio
          if (anchoOriginal > maxAncho) {
            nuevoAncho = maxAncho;
            nuevoAlto = Math.round((altoOriginal * maxAncho) / anchoOriginal);
          }

          // 2. Montaje sobre el lienzo virtual Canvas
          const canvas = document.createElement("canvas");
          canvas.width = nuevoAncho;
          canvas.height = nuevoAlto;

          const ctx = canvas.getContext("2d");
          // Interpolar y rasterizar píxeles
          ctx.drawImage(imagen, 0, 0, nuevoAncho, nuevoAlto);

          // 3. Lossy JPEG Encoding (DCT + Submuestreo cromático + descarte de metadatos EXIF)
          const dataURL = canvas.toDataURL("image/jpeg", factorCalidad);

          resolve({
            base64: dataURL,
            ancho: nuevoAncho,
            alto: nuevoAlto,
            pesoOriginalBytes: archivo.size,
            // Estimación matemática aproximada del peso del binario Base64
            pesoFinalBytes: Math.round(dataURL.length * 0.75)
          });
        };

        imagen.onerror = function () {
          reject(new Error("No se pudo procesar la matriz de píxeles de la imagen."));
        };
      };

      lector.onerror = function () {
        reject(new Error("Error de lectura del archivo en el navegador."));
      };
    });
  }
};