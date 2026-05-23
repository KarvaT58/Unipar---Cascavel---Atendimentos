export const MAX_UPLOAD_FILE_SIZE_MB = 16;
export const MAX_UPLOAD_FILE_SIZE_BYTES =
  MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;

export function splitFilesByUploadSize(files: File[]) {
  return files.reduce(
    (groups, file) => {
      if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        groups.rejectedFiles.push(file);
      } else {
        groups.acceptedFiles.push(file);
      }

      return groups;
    },
    {
      acceptedFiles: [] as File[],
      rejectedFiles: [] as File[],
    },
  );
}

export function getUploadSizeLimitMessage(rejectedCount: number) {
  return rejectedCount === 1
    ? "1 arquivo ultrapassa o limite de 16 MB."
    : `${rejectedCount} arquivos ultrapassam o limite de 16 MB.`;
}
