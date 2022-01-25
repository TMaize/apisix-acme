yarn

image=tmaize/apisix-acme:1.0.1
docker build --no-cache --rm --tag ${image} .

input=$1

case $input in
  publish)
    docker push ${image}
    ;;
  *)
    echo ""
    ;;
esac
