"""Document file storage — AWS S3 when configured, local disk fallback for dev."""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Optional, Tuple

import boto3
from botocore.exceptions import ClientError

S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "").strip()
AWS_REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1")).strip()
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "").strip()
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "").strip()

LOCAL_UPLOAD_ROOT = Path(__file__).parent / "uploads" / "documents"
PRESIGNED_URL_EXPIRY = int(os.environ.get("S3_PRESIGNED_URL_EXPIRY", "3600"))


def storage_enabled() -> bool:
    return bool(S3_BUCKET_NAME)


def _s3_client():
    kwargs = {"region_name": AWS_REGION}
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY
    return boto3.client("s3", **kwargs)


def build_object_key(document_id: str, filename: str) -> str:
    ext = Path(filename or "file").suffix.lower() or ".bin"
    return f"documents/{document_id}/{uuid.uuid4().hex}{ext}"


def _local_path_for_key(object_key: str) -> Path:
    safe = object_key.replace("/", "__")
    return LOCAL_UPLOAD_ROOT / safe


def upload_bytes(
    *,
    document_id: str,
    content: bytes,
    content_type: str,
    filename: str,
) -> Tuple[str, str]:
    """Upload file bytes. Returns (object_key, file_reference)."""
    object_key = build_object_key(document_id, filename)

    if storage_enabled():
        client = _s3_client()
        client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=object_key,
            Body=content,
            ContentType=content_type or "application/octet-stream",
        )
        return object_key, f"s3://{S3_BUCKET_NAME}/{object_key}"

    LOCAL_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    path = _local_path_for_key(object_key)
    path.write_bytes(content)
    return object_key, f"/api/documents/{document_id}/file"


def read_bytes(object_key: str) -> Optional[bytes]:
    if not object_key:
        return None

    if storage_enabled():
        try:
            response = _s3_client().get_object(Bucket=S3_BUCKET_NAME, Key=object_key)
            return response["Body"].read()
        except ClientError:
            return None

    path = _local_path_for_key(object_key)
    if path.is_file():
        return path.read_bytes()
    return None


def delete_object(object_key: str) -> None:
    if not object_key:
        return

    if storage_enabled():
        try:
            _s3_client().delete_object(Bucket=S3_BUCKET_NAME, Key=object_key)
        except ClientError:
            pass
        return

    path = _local_path_for_key(object_key)
    if path.is_file():
        path.unlink(missing_ok=True)


def presigned_download_url(object_key: str) -> Optional[str]:
    if not storage_enabled() or not object_key:
        return None
    try:
        return _s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET_NAME, "Key": object_key},
            ExpiresIn=PRESIGNED_URL_EXPIRY,
        )
    except ClientError:
        return None
