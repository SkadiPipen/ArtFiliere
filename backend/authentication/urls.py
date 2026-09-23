from django.urls import path
from .views import ChatUsersView, login, me, register

urlpatterns = [
    path("chat-users/", ChatUsersView.as_view(), name="chat_users"),

    path("login/",login),
    path("register/", register),
    path("me/", me),

]
