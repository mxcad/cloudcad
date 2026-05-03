import SparkMD5 from 'spark-md5';

/**
 * 计算文件的 MD5 哈希值
 * 使用 SparkMD5 库进行高效计算
 */
export async function calculateFileHash(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunkSize = 2 * 1024 * 1024; // 2MB 每块
    const chunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;

    const spark = new SparkMD5.ArrayBuffer();
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.onload = (e) => {
      const result = e.target?.result as ArrayBuffer;
      spark.append(result);
      currentChunk++;

      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    function loadNext() {
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      reader.readAsArrayBuffer(file.slice(start, end));
    }

    loadNext();
  });
}
