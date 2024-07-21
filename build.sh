image=apisix-acme:2.3.4

input=$1

case $input in
  build)
    docker build --no-cache --rm --tag ${image} .
    ;;
  publish)
    repository=tmaize/${image}
    docker tag ${image} ${repository}
    docker push ${repository}
    ;;
  publish2)
    repository=ccr.ccs.tencentyun.com/free-guangzhou/${image}
    docker tag ${image} ${repository}
    docker push ${repository}
    ;;
  *)
    echo "no input"
    ;;
esac
