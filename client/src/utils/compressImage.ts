export async function compressImage(file: File, maxWidth = 1920, maxHeight = 1920, quality = 0.75): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.size < 100 * 1024) return file

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width <= maxWidth && height <= maxHeight && file.size < 500 * 1024) {
          resolve(file)
          return
        }
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth }
        if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return }
          const ext = file.name.split('.').pop() || 'jpg'
          const compressed = new File([blob], file.name, { type: `image/${ext === 'png' ? 'png' : 'jpeg'}` })
          resolve(compressed.size < file.size ? compressed : file)
        }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality)
      }
      img.onerror = () => resolve(file)
      img.src = e.target?.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}
