export function getTextDimensions(text: string, fontSize: string = "16px", fontFamily: string = "inherit") {
    // ‍  创建一个隐藏的临时元素
// ‍ Create a hidden temporary element

    var tempElement = document.createElement('span');
    tempElement.style.position = 'absolute'; // ‍  使其脱离文档流，不影响布局
// ‍ Remove it from the document flow without affecting the layout

    tempElement.style.whiteSpace = 'nowrap'; // ‍  防止换行
// ‍ Prevent line breaks

    tempElement.style.visibility = 'hidden'; // ‍  隐藏元素
// ‍ Hidden elements

    tempElement.style.fontSize = fontSize; // ‍  设置字体大小
// ‍ Set font size

    tempElement.style.fontFamily = fontFamily; // ‍  设置字体家族
// ‍ Set font family


    // ‍  将文本放入元素中
// ‍ Put text into elements

    tempElement.innerHTML = text;

    // ‍  将此元素添加到DOM中，以便可以测量其尺寸
// ‍ Add this element to the DOM so that its size can be measured

    document.body.appendChild(tempElement);

    // ‍  获取宽度和高度
// ‍ Obtain width and height

    const width = tempElement.offsetWidth;
    const height = tempElement.offsetHeight;

    // ‍  测量后从DOM中移除这个临时元素
// ‍ Remove this temporary element from DOM after measurement

    document.body.removeChild(tempElement);

    // ‍  返回宽度和高度
// ‍ Return width and height

    return { width: width, height: height };
}