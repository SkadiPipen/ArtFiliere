from django.urls import path
from .views import login, me, register

urlpatterns = [

    path("login/",login),
    path("register/", register),
    path("me/", me),

]
