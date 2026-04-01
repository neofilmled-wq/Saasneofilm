resource "aws_s3_bucket" "creatives" {
  bucket = "${var.project}-${var.environment}-creatives"

  tags = {
    Name = "${var.project}-${var.environment}-creatives"
  }
}

resource "aws_s3_bucket_versioning" "creatives" {
  bucket = aws_s3_bucket.creatives.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "creatives" {
  bucket = aws_s3_bucket.creatives.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "creatives" {
  bucket = aws_s3_bucket.creatives.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "creatives" {
  bucket = aws_s3_bucket.creatives.id

  rule {
    id     = "cleanup-temp-uploads"
    status = "Enabled"

    filter {
      prefix = "orgs/"
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  rule {
    id     = "expire-tmp"
    status = "Enabled"

    filter {
      prefix = "tmp/"
    }

    expiration {
      days = 1
    }
  }
}

# CloudFront distribution for serving creatives
resource "aws_cloudfront_distribution" "cdn" {
  origin {
    domain_name = aws_s3_bucket.creatives.bucket_regional_domain_name
    origin_id   = "s3-creatives"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  enabled             = true
  default_root_object = ""
  price_class         = "PriceClass_100" # EU + NA

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-creatives"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project}-${var.environment}-cdn"
  }
}

resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "${var.project} ${var.environment} OAI"
}

data "aws_iam_policy_document" "s3_cloudfront" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.creatives.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_cloudfront_origin_access_identity.main.iam_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "cloudfront" {
  bucket = aws_s3_bucket.creatives.id
  policy = data.aws_iam_policy_document.s3_cloudfront.json
}
