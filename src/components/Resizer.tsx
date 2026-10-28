import { useEffect, useRef, useState } from 'react'

interface ResizerProps {
  onResize: (delta: number) => void
}

export function Resizer({ onResize }: ResizerProps) {
  const isDragging = useRef(false)
  const startX = useRef(0)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return

      const delta = e.clientX - startX.current
      startX.current = e.clientX
      onResize(delta)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onResize])

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative flex-shrink-0 cursor-col-resize"
      style={{
        width: '8px',
        minWidth: '8px',
        maxWidth: '8px',
        backgroundColor: '#e5e7eb',
      }}
    >
      {/* 호버 영역 확장 */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          width: '20px',
          left: '-6px',
        }}
      >
        {/* 드래그 핸들 표시 */}
        <div
          className="rounded-full transition-all duration-200"
          style={{
            width: isHovered ? '6px' : '4px',
            height: '48px',
            backgroundColor: '#3b82f6',
            opacity: isHovered ? 1 : 0.5,
          }}
        />
      </div>
    </div>
  )
}
