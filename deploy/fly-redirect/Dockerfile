# 리다이렉트 한 줄만 하는 fly 앱. 빌드할 코드가 없어서 nginx 설정만 얹는다.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
