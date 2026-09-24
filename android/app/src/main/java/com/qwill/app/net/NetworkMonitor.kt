package com.qwill.app.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest

class NetworkMonitor(private val context: Context, private val listener: Listener) {
    interface Listener {
        fun onNetworkAvailable()

        fun onNetworkLost()
    }

    private val networks = HashSet<Network>()

    fun start(): Boolean {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        manager.registerNetworkCallback(
            request,
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    synchronized(networks) { networks.add(network) }
                    listener.onNetworkAvailable()
                }

                override fun onLost(network: Network) {
                    val none = synchronized(networks) {
                        networks.remove(network)
                        networks.isEmpty()
                    }
                    if (none) listener.onNetworkLost()
                }
            },
        )
        @Suppress("DEPRECATION")
        return manager.activeNetworkInfo?.isConnected == true
    }
}
