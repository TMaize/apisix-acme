image=apisix-acme:1.0.3

input=$1

case $input in
  build)
    yarn
    docker build --no-cache --rm --tag ${image} .
    ;;
  publish)
    img_dockerhub=tmaize/${image}
    docker tag ${image} ${img_dockerhub}
    docker push ${img_dockerhub}
    ;;
  publish2)
    img_tencent=ccr.ccs.tencentyun.com/free-guangzhou/${image}
    docker tag ${image} ${img_tencent}
    docker push ${img_tencent}
    ;;
  *)
    echo "no input"
    ;;
esac
