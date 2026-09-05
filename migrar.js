const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const supabaseUrl = 'https://rlzpeghfolrjkyallxaa.supabase.co';
const supabaseKey = 'sb_secret_57P8RhQut1worvhzPwoZzQ_CLmgmqOd';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrarPorPartes() {
  console.log("Iniciando migración segura por lotes...");

  let inicio = 0;
  const tamanoLote = 5; 
  let continuar = true;

  while (continuar) {
    const { data: filas, error } = await supabase
      .from('peces')
      .select('id, fotos')
      .range(inicio, inicio + tamanoLote - 1);

    if (error) {
      console.error("Error al leer bloque de la tabla:", error.message);
      break;
    }

    if (!filas || filas.length === 0) {
      console.log("¡No hay más registros por procesar!");
      break;
    }

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      let fotosArray = fila.fotos;
      if (!Array.isArray(fotosArray)) continue;

      let modificado = false;

      for (let j = 0; j < fotosArray.length; j++) {
        const fotoObj = fotosArray[j];

        if (fotoObj.url && fotoObj.url.startsWith('data:image')) {
          try {
            const base64Data = fotoObj.url.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');

            const bufferComprimido = await sharp(buffer)
              .resize({ width: 1000, withoutEnlargement: true })
              .jpeg({ quality: 80 })
              .toBuffer();

            const nombreArchivo = `especie-${fila.id}-${Date.now()}-${j}.jpg`;

            const { error: errorUpload } = await supabase.storage
              .from('fotos')
              .upload(nombreArchivo, bufferComprimido, { contentType: 'image/jpeg' });

            if (errorUpload) {
              console.error(`Error al subir imagen ID ${fila.id}:`, errorUpload.message);
              continue;
            }

            const { data: urlData } = supabase.storage
              .from('fotos')
              .getPublicUrl(nombreArchivo);

            fotoObj.url = urlData.publicUrl;
            modificado = true;
            console.log(`-> Fila ID ${fila.id} procesada y subida correctamente.`);
          } catch (e) {
            console.error(`Fallo procesando ID ${fila.id}:`, e);
          }
        }
      }

      if (modificado) {
        const { error: errorUpdate } = await supabase
          .from('peces')
          .update({ fotos: fotosArray })
          .eq('id', fila.id);

        if (errorUpdate) {
          console.error(`Error actualizando base de datos para ID ${fila.id}:`, errorUpdate.message);
        }
      }
    }

    inicio += tamanoLote;
    
    if (filas.length < tamanoLote) {
      continuar = false;
    }
  }

  console.log("\n¡Proceso de migración por lotes finalizado con éxito!");
}

migrarPorPartes();