package com.qwill.app.search

import com.qwill.app.model.SearchResultsDto
import com.qwill.app.net.ApiRequest
import java.net.URLEncoder

object SearchRequests {
    fun search(query: String): ApiRequest<SearchResultsDto> =
        ApiRequest.get("/api/search?q=${URLEncoder.encode(query, "UTF-8")}", SearchResultsDto.serializer())
}
