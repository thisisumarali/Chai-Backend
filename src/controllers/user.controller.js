import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { User } from '../models/users.model.js'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        // finding a user
        const user = await User.findById(userId);
        // Generating access and refresh token
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        // saving refresh token in database
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })
        // return tokens
        return { accessToken, refreshToken }

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access token")
    }
}

const registerUser = asyncHandler(async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user in object - create entry in db
    // remove password and refresh token field from response
    // check for user creation 
    // return res

    const { fullName, email, username, password } = req.body
    // console.log("email:", email);


    if ([fullName, email, username, password].some((field) =>
        field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ email }, { username }],
    })
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        username,
        password,
        username: username.toLowerCase(),
    })
    const createUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createUser) {
        throw new ApiError(500, "something went wrong while registering user ")
    }
    return res.status(201).json(
        new ApiResponse(200, createUser, "User register successfully")
    )
})
const loginUser = asyncHandler(async (req, res) => {
    // req body -> data
    // username or email
    // find the user
    // password check
    // access and refresh token
    // send cookie
    // respone 

    const { email, username, password } = req.body
    if (!(username || email)) {
        throw new ApiError(404, "Username or email is required!")
    }
    const user = await User.findOne({
        $or: [{ email }, { username }],
    })
    if (!user) {
        throw new ApiError(404, 'user doesnot exist')
    }
    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid) {
        throw new ApiError(401, 'Password is not correct')
    }
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)
    // to remove password
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    // send cookies
    const options = {
        httpOnly: true,
        secure: true
    }
    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "User logged in successfully")
        )

})
const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true,
        }
    )
    const options =
    {
        httpOnly: true,
        secure: true
    }
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id)
        if (!user) {
            throw new ApiError(401, "Invalid Refresh Token")
        }
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }
        const options = {
            httpOnly: true,
            secure: true
        }
        const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id)
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(200, { accessToken, refreshToken: newRefreshToken }, "Access token refreshed successfully")
            )
    } catch (error) {
        throw new ApiError(401, error?.message ||
            "Invalid refresh token"
        )
    }
})
const ChangeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body

    const user = User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old Password")
    }
    user.password = newPassword;
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "password changed successfully"))
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body
    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        { new: true }
    ).select("-password")
    return res
        .status(200)
        .json(new ApiResponse(200, user, "Account details update successfully"))
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true }
    ).select("-password")
    return res
        .status(200)
        .json(new ApiResponse(200, user, "Avatar update successfully"))
})
const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path
    if (!coverImageLocalPath) {
        throw new ApiError(400, "CoverImage is missing")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading on coverImage")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true }
    ).select("-password")

    return res
        .status(200)
        .json(new ApiResponse(200, user, "CoverImage update successfully"))
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params
    if (!username?.trim()) {
        throw new ApiError(400, "Username is missing")
    }
    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"

            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount:
                {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed,
                avatar: 1,
                coverImage: 1,
                email: 1,
            }
        }

    ])
    if (!channel?.length) {
        throw new ApiError(404, "channel doesnot exist")
    }
    return res
        .status(200)
        .json(new ApiResponse(200, channel[0], "User channel fetched successfully"))
})

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            },
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner",
                            }
                        }
                    },
                ]
            },

        }
    ])
    return res
        .status(200)
        .json(new ApiResponse(200, user[0].watchHistory,
            "watch history fetched successfully"
        ))
})
export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    ChangeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getWatchHistory,
    getUserChannelProfile
}