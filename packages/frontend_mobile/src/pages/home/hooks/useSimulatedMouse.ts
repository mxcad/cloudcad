import { ref } from "vue";

export const useSimulatedMouse = () => {
    const needle = ref()
    const handle = ref()
    const arrowTip = ref()
    let isDragging = false;
    let startX = 0, startY = 0;

    const onTouchstart = (e: TouchEvent) => {
        e.preventDefault();
        isDragging = true;
        startX = e.touches[0].pageX;
        startY = e.touches[0].pageY;
    };
    function getElementScreenCoordinates(element: HTMLElement) {
        // ‍  使用getBoundingClientRect()获取元素的边界信息
// ‍ Use getBoundingClientRect() to obtain the boundary information of an element

        const { top, left } = element.getBoundingClientRect();
        // ‍  返回元素距离屏幕左上角的坐标
// ‍ Return the coordinates of the element from the top left corner of the screen

        return {
            x: left + window.scrollX, // ‍  加上window.scrollX以获取相对于屏幕的水平坐标
// ‍ Add window.scrolX to obtain the horizontal coordinates relative to the screen

            y: top + window.scrollY // ‍  加上window.scrollY以获取相对于屏幕的垂直坐标
// ‍ Add window.scrolY to obtain the vertical coordinates relative to the screen

        };
    }
    const onTouchmove = (e: TouchEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const offsetWidth = handle.value.offsetWidth / 2
        const offsetHeight = handle.value.offsetHeight / 2
        const deltaX = touch.pageX - offsetWidth;
        const deltaY = touch.pageY - offsetHeight;;
        needle.value.style.transform = `translate(${deltaX + offsetWidth}px, ${deltaY + offsetHeight}px) rotate(-110deg)`;
        handle.value.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        console.log(getElementScreenCoordinates(arrowTip.value))
    }
    document.addEventListener("touchmove", onTouchmove)
    document.addEventListener('touchend', () => {
        isDragging = false;
    });
    return {
        needle,
        handle,
        arrowTip,
        onTouchstart
    }
}