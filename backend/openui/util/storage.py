import boto3
import gzip
from io import BytesIO
from .. import config

s3 = boto3.client('s3', endpoint_url=config.AWS_ENDPOINT_URL_S3)

def upload(name: str, data: str):
    gzip_buffer = BytesIO()
    with gzip.GzipFile(mode='wb', fileobj=gzip_buffer) as gzip_file:
        gzip_file.write(data.encode('utf-8'))
    return s3.put_object(
        Bucket=config.BUCKET_NAME,
        Key=name,
        Body=gzip_buffer.getvalue(),
        ContentEncoding='gzip',
        ContentType='application/json'
    )

def download(name: str) -> str:
    response = s3.get_object(Bucket=config.BUCKET_NAME, Key=name)
    gzip_content = response['Body'].read()
    return gzip.decompress(gzip_content)