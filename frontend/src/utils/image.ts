/**
 * Lê um arquivo de imagem, redimensiona (quadrado) e devolve um data URL JPEG
 * compactado — ideal para avatares armazenados como base64.
 */
export function fileToAvatarDataUrl(file: File, max = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('O arquivo precisa ser uma imagem'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        // Recorte quadrado central
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        canvas.width = max
        canvas.height = max
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas indisponível')); return }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, max, max)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = () => reject(new Error('Imagem inválida'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'))
    reader.readAsDataURL(file)
  })
}
